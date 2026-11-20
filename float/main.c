/* Small Windows helper. It does not read the news. It only keeps the already
   installed 讯息窗 window above other windows, and slides it off the left or
   right edge after the person lets go there. */
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <string.h>

#include "logic.h"

#define EDGE_PX 28
#define PEEK_PX 10
#define SLOP_PX 14
#define WM_TRAY (WM_APP + 1)

static const wchar_t MARK[] = L"\x8BAF\x606F\x7A97"; /* 讯息窗 */
static const wchar_t TIP[] = L"\x8BAF\x606F\x7A97\x60AC\x6D6E"; /* 讯息窗悬浮 */
static const wchar_t QUIT[] = L"\x9000\x51FA"; /* 退出 */
static const wchar_t FOUND_TEXT[] =
    L"\x5DF2\x7ECF\x8FDE\x4E0A\x8BAF\x606F\x7A97\x3002\x5B83\x4F1A\x6D6E\x5728\x522B\x7684\x7A97\x53E3\x4E0A\x9762\x3002\n"
    L"\x62D6\x5230\x5C4F\x5E55\x5DE6\x7F18\x6216\x53F3\x7F18\xFF0C\x677E\x624B\x540E\x4F1A\x7F29\x8FDB\x53BB\x3002";
static const wchar_t MISSING_TEXT[] =
    L"\x8FD8\x6CA1\x770B\x89C1\x8BAF\x606F\x7A97\x3002\n"
    L"\x8BF7\x5148\x4ECE\x5F00\x59CB\x83DC\x5355\x6253\x5F00\x88C5\x597D\x7684\x8BAF\x606F\x7A97\xFF0C\x4E0D\x8981\x7528\x6D4F\x89C8\x5668\x6807\x7B7E\x9875\x3002";

typedef struct Track {
    HWND hwnd;
    Side side;
    int hover;
    int suppress;
    int was_down;
    Box home;
} Track;

static Track track;
static HWND host;
static HWND status_box;
static HFONT ui_font;
static int status_found = -1;
static NOTIFYICONDATAW tray;

static Box from_rect(RECT rect) {
    Box box = {rect.left, rect.top, rect.right, rect.bottom};
    return box;
}

static Box window_box(HWND hwnd) {
    RECT rect;
    GetWindowRect(hwnd, &rect);
    return from_rect(rect);
}

static Box work_box(HWND hwnd) {
    MONITORINFO info;
    HMONITOR monitor;
    info.cbSize = sizeof(info);
    monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
    if (!GetMonitorInfoW(monitor, &info)) {
        Box fallback = {0, 0, GetSystemMetrics(SM_CXSCREEN), GetSystemMetrics(SM_CYSCREEN)};
        return fallback;
    }
    return from_rect(info.rcWork);
}

static int title_matches(HWND hwnd) {
    wchar_t title[512];
    wchar_t klass[64];
    if (!IsWindowVisible(hwnd) || IsIconic(hwnd)) return 0;
    if (GetAncestor(hwnd, GA_ROOT) != hwnd) return 0;
    if (!GetClassNameW(hwnd, klass, 64)) return 0;
    if (lstrcmpW(klass, L"Chrome_WidgetWin_1") != 0) return 0;
    if (!GetWindowTextW(hwnd, title, 512)) return 0;
    if (!wcsstr(title, MARK)) return 0;
    if (wcsstr(title, L"Chrome") || wcsstr(title, L"Edge") || wcsstr(title, L"Firefox")) return 0;
    return 1;
}

typedef struct Find {
    HWND best;
    HWND foreground;
} Find;

static BOOL CALLBACK find_cb(HWND hwnd, LPARAM param) {
    Find *found = (Find *)param;
    if (!title_matches(hwnd)) return TRUE;
    if (!found->best) found->best = hwnd;
    if (hwnd == found->foreground) found->best = hwnd;
    return TRUE;
}

static HWND find_window(void) {
    Find found;
    found.best = NULL;
    found.foreground = GetForegroundWindow();
    EnumWindows(find_cb, (LPARAM)&found);
    return found.best;
}

static void move_top(HWND hwnd, Box box, int move) {
    if (move) {
        SetWindowPos(hwnd, HWND_TOPMOST, (int)box.left, (int)box.top, 0, 0,
                     SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
        return;
    }
    SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0,
                 SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
}

static void clear_top(HWND hwnd, int restore) {
    if (!hwnd || !IsWindow(hwnd)) return;
    if (restore && track.side && !track.hover) {
        SetWindowPos(hwnd, HWND_NOTOPMOST, (int)track.home.left, (int)track.home.top, 0, 0,
                     SWP_NOSIZE | SWP_NOACTIVATE);
        return;
    }
    SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
}

static void tick(void) {
    int down = (GetAsyncKeyState(VK_LBUTTON) & 0x8000) != 0;
    int released;
    Box now;
    Box work;
    POINT point;
    Side side;

    if (!track.hwnd || !IsWindow(track.hwnd) || !IsWindowVisible(track.hwnd) || IsIconic(track.hwnd)) {
        clear_top(track.hwnd, 0);
        track.hwnd = find_window();
        track.side = SIDE_NONE;
        track.hover = 0;
        track.suppress = 0;
        track.was_down = down;
        if (track.hwnd) move_top(track.hwnd, track.home, 0);
        return;
    }
    if (IsZoomed(track.hwnd)) {
        track.side = SIDE_NONE;
        track.hover = 0;
        track.was_down = down;
        return;
    }

    now = window_box(track.hwnd);
    work = work_box(track.hwnd);
    GetCursorPos(&point);
    released = track.was_down && !down;
    track.was_down = down;
    if (down) return;

    if (!track.side) {
        if (released) {
            side = side_after_release(now, work, EDGE_PX);
            if (side) {
                track.side = side;
                track.home = now;
                track.hover = 0;
                track.suppress = 1;
                move_top(track.hwnd, place_collapsed(now, work, side, PEEK_PX), 1);
            }
        }
        return;
    }

    if (released && !track.hover) {
        Box collapsed = place_collapsed(track.home, work, track.side, PEEK_PX);
        long visible = track.side == SIDE_LEFT ? now.right - work.left : work.right - now.left;
        if (!box_near(now, collapsed, 48) && visible > PEEK_PX + 80) {
            track.side = SIDE_NONE;
            track.home = now;
            track.suppress = 0;
            return;
        }
        if (!box_near(now, collapsed, 48)) {
            track.home.top = now.top;
            track.home.bottom = now.top + box_height(track.home);
            move_top(track.hwnd, place_collapsed(track.home, work, track.side, PEEK_PX), 1);
            return;
        }
    }

    if (released && track.hover) {
        side = side_after_release(now, work, EDGE_PX);
        if (!side) {
            track.side = SIDE_NONE;
            track.hover = 0;
            track.home = now;
            return;
        }
        track.side = side;
        track.home = now;
        track.hover = 0;
        track.suppress = 1;
        move_top(track.hwnd, place_collapsed(now, work, side, PEEK_PX), 1);
        return;
    }

    if (track.hover) {
        if (!pointer_inside(track.home, point.x, point.y, SLOP_PX)) {
            track.hover = 0;
            track.suppress = 1;
            move_top(track.hwnd, place_collapsed(track.home, work, track.side, PEEK_PX), 1);
        }
        return;
    }

    if (track.suppress) {
        if (!pointer_on_peek(place_collapsed(track.home, work, track.side, PEEK_PX), work, track.side,
                             point.x, point.y, SLOP_PX, PEEK_PX)) {
            track.suppress = 0;
        }
        return;
    }

    if (pointer_on_peek(place_collapsed(track.home, work, track.side, PEEK_PX), work, track.side,
                        point.x, point.y, SLOP_PX, PEEK_PX)) {
        track.hover = 1;
        move_top(track.hwnd, track.home, 1);
    }
}

static void show_menu(void) {
    HMENU menu;
    POINT point;
    menu = CreatePopupMenu();
    if (!menu) return;
    AppendMenuW(menu, MF_STRING, 1, QUIT);
    GetCursorPos(&point);
    SetForegroundWindow(host);
    TrackPopupMenu(menu, TPM_RIGHTALIGN | TPM_BOTTOMALIGN | TPM_RIGHTBUTTON, point.x, point.y, 0, host, NULL);
    DestroyMenu(menu);
}

static void quit(void) {
    clear_top(track.hwnd, 1);
    Shell_NotifyIconW(NIM_DELETE, &tray);
    DestroyWindow(host);
}

static void paint_status(int found) {
    if (!status_box || found == status_found) return;
    status_found = found;
    SetWindowTextW(status_box, found ? FOUND_TEXT : MISSING_TEXT);
}

static LRESULT CALLBACK host_proc(HWND hwnd, UINT msg, WPARAM wparam, LPARAM lparam) {
    switch (msg) {
    case WM_TRAY:
        if (lparam == WM_RBUTTONUP || lparam == WM_CONTEXTMENU) show_menu();
        if (lparam == WM_LBUTTONUP) {
            ShowWindow(host, SW_SHOWNORMAL);
            SetForegroundWindow(host);
        }
        return 0;
    case WM_COMMAND:
        if (LOWORD(wparam) == 1) quit();
        return 0;
    case WM_CLOSE:
        quit();
        return 0;
    case WM_TIMER:
        tick();
        paint_status(track.hwnd && IsWindow(track.hwnd));
        return 0;
    case WM_DESTROY:
        PostQuitMessage(0);
        return 0;
    default:
        return DefWindowProcW(hwnd, msg, wparam, lparam);
    }
}

static void enable_dpi(void) {
    HMODULE user = GetModuleHandleW(L"user32.dll");
    FARPROC raw = user ? GetProcAddress(user, "SetProcessDpiAwarenessContext") : NULL;
    BOOL(WINAPI *set_dpi)(HANDLE);
    if (!raw) return;
    memcpy(&set_dpi, &raw, sizeof(set_dpi));
    set_dpi((HANDLE)-4);
}

int WINAPI WinMain(HINSTANCE instance, HINSTANCE prev, LPSTR cmd, int show) {
    WNDCLASSW klass;
    MSG msg;
    HANDLE mutex;
    (void)prev;
    (void)cmd;
    (void)show;
    mutex = CreateMutexW(NULL, TRUE, L"Local\\InfoWindowFloat");
    if (mutex && GetLastError() == ERROR_ALREADY_EXISTS) {
        HWND existing = FindWindowW(L"InfoWindowFloatHost", NULL);
        if (existing) {
            ShowWindow(existing, SW_SHOWNORMAL);
            SetForegroundWindow(existing);
        }
        return 0;
    }
    enable_dpi();
    ZeroMemory(&klass, sizeof(klass));
    klass.lpfnWndProc = host_proc;
    klass.hInstance = instance;
    klass.lpszClassName = L"InfoWindowFloatHost";
    klass.hCursor = LoadCursorW(NULL, (LPCWSTR)IDC_ARROW);
    klass.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
    if (!RegisterClassW(&klass)) return 0;
    host = CreateWindowExW(WS_EX_APPWINDOW, klass.lpszClassName, TIP,
                           WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX,
                           CW_USEDEFAULT, CW_USEDEFAULT, 460, 230,
                           NULL, NULL, instance, NULL);
    if (!host) return 0;
    ui_font = CreateFontW(-18, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
                          OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
                          DEFAULT_PITCH | FF_DONTCARE, L"Microsoft YaHei UI");
    status_box = CreateWindowExW(0, L"STATIC", MISSING_TEXT, WS_CHILD | WS_VISIBLE | SS_LEFT,
                                 20, 16, 404, 100, host, (HMENU)100, instance, NULL);
    CreateWindowExW(0, L"BUTTON", QUIT, WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON,
                    170, 132, 100, 32, host, (HMENU)1, instance, NULL);
    if (ui_font) {
        SendMessageW(status_box, WM_SETFONT, (WPARAM)ui_font, TRUE);
        SendMessageW(GetDlgItem(host, 1), WM_SETFONT, (WPARAM)ui_font, TRUE);
    }
    status_found = 0;
    ShowWindow(host, SW_SHOWNORMAL);
    UpdateWindow(host);
    ZeroMemory(&tray, sizeof(tray));
    tray.cbSize = sizeof(tray);
    tray.hWnd = host;
    tray.uID = 1;
    tray.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP;
    tray.uCallbackMessage = WM_TRAY;
    tray.hIcon = LoadIconW(NULL, (LPCWSTR)IDI_APPLICATION);
    lstrcpynW(tray.szTip, TIP, (int)(sizeof(tray.szTip) / sizeof(wchar_t)));
    Shell_NotifyIconW(NIM_ADD, &tray);
    SetTimer(host, 1, 32, NULL);
    while (GetMessageW(&msg, NULL, 0, 0) > 0) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
    return 0;
}
