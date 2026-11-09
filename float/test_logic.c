#include "logic.h"

#include <stdio.h>

static int failures = 0;

static void expect(int cond, const char *message) {
    if (cond) return;
    failures += 1;
    fprintf(stderr, "fail: %s\n", message);
}

int main(void) {
    Box work = {0, 0, 1920, 1080};
    Box left = {12, 80, 412, 860};
    Box right = {1500, 80, 1900, 860};
    Box middle = {600, 80, 1000, 860};
    Box wide = {10, 40, 1800, 1000};

    expect(side_after_release(left, work, 28) == SIDE_LEFT, "left edge docks left");
    expect(side_after_release(right, work, 28) == SIDE_RIGHT, "right edge docks right");
    expect(side_after_release(middle, work, 28) == SIDE_NONE, "middle stays free");
    expect(side_after_release(wide, work, 28) == SIDE_NONE, "a wide window does not dock");

    Box hidden = place_collapsed(left, work, SIDE_LEFT, 10);
    expect(hidden.right == 10, "left dock keeps a 10px sliver");
    expect(hidden.left == 10 - 400, "left dock slides the rest off-screen");
    expect(hidden.top == 80, "left dock keeps the vertical position");

    Box hidden_right = place_collapsed(right, work, SIDE_RIGHT, 10);
    expect(hidden_right.left == 1910, "right dock keeps a 10px sliver");

    expect(pointer_on_peek(hidden, work, SIDE_LEFT, 4, 200, 12, 10), "cursor on the left sliver");
    expect(!pointer_on_peek(hidden, work, SIDE_LEFT, 80, 200, 12, 10), "cursor away from the sliver");
    expect(pointer_inside(left, 200, 400, 8), "cursor inside the open window");
    expect(!pointer_inside(left, 200, 20, 8), "cursor above the open window");
    expect(box_near(hidden, place_collapsed(left, work, SIDE_LEFT, 10), 4), "collapsed position is stable");

    if (failures) {
        fprintf(stderr, "%d failed\n", failures);
        return 1;
    }
    return 0;
}
