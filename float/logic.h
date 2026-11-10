/* Geometry for docking a window to the left or right edge of the work area. */
#ifndef INFO_WINDOW_FLOAT_LOGIC_H
#define INFO_WINDOW_FLOAT_LOGIC_H

typedef struct Box {
    long left;
    long top;
    long right;
    long bottom;
} Box;

typedef enum Side {
    SIDE_NONE = 0,
    SIDE_LEFT = 1,
    SIDE_RIGHT = 2
} Side;

static long box_width(Box box) {
    return box.right - box.left;
}

static long box_height(Box box) {
    return box.bottom - box.top;
}

/* A normal window released against the left or right edge should dock.
   A window that already fills the work area should stay put. */
static Side side_after_release(Box win, Box work, int threshold) {
    long width = box_width(win);
    long area = box_width(work);
    if (width < 80 || area < 200) return SIDE_NONE;
    if (width > area * 85 / 100) return SIDE_NONE;
    if (win.left <= work.left + threshold) return SIDE_LEFT;
    if (win.right >= work.right - threshold) return SIDE_RIGHT;
    return SIDE_NONE;
}

static Box place_collapsed(Box win, Box work, Side side, int peek) {
    long width = box_width(win);
    long height = box_height(win);
    long top = win.top;
    if (top < work.top) top = work.top;
    if (top + height > work.bottom) top = work.bottom - height;
    if (top < work.top) top = work.top;
    Box out;
    out.top = top;
    out.bottom = top + height;
    if (side == SIDE_RIGHT) {
        out.left = work.right - peek;
        out.right = out.left + width;
    } else {
        out.right = work.left + peek;
        out.left = out.right - width;
    }
    return out;
}

static int pointer_inside(Box box, long x, long y, int slop) {
    return x >= box.left - slop && x < box.right + slop && y >= box.top - slop && y < box.bottom + slop;
}

static int pointer_on_peek(Box collapsed, Box work, Side side, long x, long y, int slop, int peek) {
    if (y < collapsed.top - slop || y >= collapsed.bottom + slop) return 0;
    if (side == SIDE_RIGHT) {
        return x >= work.right - peek - slop && x < work.right + slop;
    }
    return x >= work.left - slop && x < work.left + peek + slop;
}

static int box_near(Box a, Box b, int slack) {
    long dl = a.left - b.left;
    long dt = a.top - b.top;
    if (dl < 0) dl = -dl;
    if (dt < 0) dt = -dt;
    return dl <= slack && dt <= slack;
}

#endif
