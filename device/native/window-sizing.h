#import <Cocoa/Cocoa.h>

static const NSSize MJInitialWindowSize = {420, 550};
static NSRect MJFitFrame(NSRect previous, NSSize size, NSRect screen) {
    size.width = MIN(size.width, screen.size.width);
    size.height = MIN(size.height, screen.size.height);
    return NSMakeRect(
        MIN(MAX(previous.origin.x, NSMinX(screen)), NSMaxX(screen)-size.width),
        MIN(MAX(NSMaxY(previous)-size.height, NSMinY(screen)), NSMaxY(screen)-size.height),
        size.width, size.height);
}
