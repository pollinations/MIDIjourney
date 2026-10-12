#define MIDIJOURNEY_SHORTCUT_TEST
#import "../native/shortcuts.m"
#include <assert.h>
@interface RenderWidgetHostViewCocoa : NSView
@property NSInteger copies;
@end
@implementation RenderWidgetHostViewCocoa
- (BOOL)acceptsFirstResponder { return YES; }
- (void)copy:(id)sender { self.copies++; }
@end
static NSEvent *key(NSWindow *window, NSString *chars, NSEventModifierFlags flags) {
    return [NSEvent keyEventWithType:NSEventTypeKeyDown location:NSZeroPoint
        modifierFlags:flags timestamp:0 windowNumber:window.windowNumber
        context:nil characters:chars charactersIgnoringModifiers:chars
        isARepeat:NO keyCode:8];
}
int main(void) { @autoreleasepool {
    NSRect fitted = MJFitFrame(NSMakeRect(2000,-400,600,700), NSMakeSize(1800,1200), NSMakeRect(0,0,1512,950));
    assert(NSEqualRects(fitted, NSMakeRect(0,0,1512,950)));
    [NSApplication sharedApplication];
    NSWindow *window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0,0,100,100)
        styleMask:NSWindowStyleMaskTitled backing:NSBackingStoreBuffered defer:NO];
    window.title = @"MIDI Journey 2";
    RenderWidgetHostViewCocoa *view = [RenderWidgetHostViewCocoa new];
    window.contentView = view;
    window.releasedWhenClosed = NO;
    windowDefaults = [NSMapTable weakToStrongObjectsMapTable];
    keepEditorsVisible();
    assert(NSEqualSizes(window.contentView.bounds.size, NSMakeSize(420,550)));
    assert(NSEqualSizes(window.contentMinSize, NSMakeSize(420,324)));
    assert(NSEqualSizes(window.contentMaxSize, NSMakeSize(720,1400)));
    // Closing/reopening must never restore the initial frame or a shared size.
    [window setContentSize:NSMakeSize(600,450)];
    // Keep the fixture on its actual screen. AppKit moves off-screen windows
    // when first shown, independently of our close/reopen behavior.
    NSRect visible = window.screen.visibleFrame;
    [window setFrameOrigin:NSMakePoint(NSMinX(visible)+20, NSMinY(visible)+20)];
    assert(NSContainsRect(visible, window.frame));
    NSRect resized = window.frame;
    [window close];
    keepEditorsVisible();
    assert(NSEqualRects(window.frame, resized));
    [window orderBack:nil];
    keepEditorsVisible();
    assert(NSEqualRects(window.frame, resized));
    [window orderOut:nil];
    // Another new device gets the initial size, not the first device's resize.
    NSWindow *second = [[NSWindow alloc] initWithContentRect:NSMakeRect(0,0,700,700)
        styleMask:NSWindowStyleMaskTitled backing:NSBackingStoreBuffered defer:NO];
    second.title = window.title;
    second.contentView = [RenderWidgetHostViewCocoa new];
    keepEditorsVisible();
    assert(NSEqualSizes(second.contentView.bounds.size, NSMakeSize(420,550)));
    assert(NSEqualRects(window.frame, resized));
    // Unrelated host windows are never resized.
    second.title = @"Live Set";
    [second setContentSize:NSMakeSize(500,600)];
    NSRect unrelated = second.frame;
    keepEditorsVisible();
    assert(NSEqualRects(second.frame, unrelated));
    windowDefaults = nil;
    [window makeFirstResponder:view];
    NSEvent *copy = key(window, @"c", NSEventModifierFlagCommand);
    assert(routeEditingEvent(copy, window) == nil && view.copies == 1);
    // Unsupported actions never escape into Live's responder chain.
    NSEvent *paste = key(window, @"v", NSEventModifierFlagCommand);
    assert(routeEditingEvent(paste, window) == paste);
    for (NSNumber *flags in @[@0, @(NSEventModifierFlagControl),
        @(NSEventModifierFlagCommand|NSEventModifierFlagOption),
        @(NSEventModifierFlagCommand|NSEventModifierFlagShift)]) {
        NSEvent *event = key(window, @"c", flags.unsignedLongValue);
        assert(routeEditingEvent(event, window) == event);
    }
    assert(editingAction(key(window,@"z",NSEventModifierFlagCommand)) == @selector(undo:));
    assert(editingAction(key(window,@"z",NSEventModifierFlagCommand|NSEventModifierFlagShift)) == @selector(redo:));
    assert(editingAction(key(window,@"s",NSEventModifierFlagCommand)) == NULL);
    assert(routeEditingEvent(copy, nil) == copy);
    window.title = @"Live Set";
    assert(routeEditingEvent(copy, window) == copy);
    window.title = @"MIDI Journey 2";
    [window makeFirstResponder:window];
    assert(routeEditingEvent(copy, window) == copy);
    assert(view.copies == 1);
    puts("Native shortcuts and window lifecycle: passed (initial size, reopen frame, independent devices, focused editing only)");
} return 0; }
