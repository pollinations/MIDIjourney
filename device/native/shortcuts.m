// jweb's CEF view implements AppKit editing actions, but Live intercepts their
// key equivalents. Route only these actions, only in Midijourney's focused CEF
// view. Chromium retains ownership of selection, clipboard, input events and
// undo history. No global event tap, clipboard access, or synthesized input.
#import <Cocoa/Cocoa.h>
#import "window-sizing.h"
#ifndef MIDIJOURNEY_SHORTCUT_TEST
#include "ext.h"
#include "ext_obex.h"
#endif

static SEL editingAction(NSEvent *event) {
    NSEventModifierFlags modifiers = event.modifierFlags &
        (NSEventModifierFlagCommand | NSEventModifierFlagShift |
         NSEventModifierFlagControl | NSEventModifierFlagOption);
    NSString *key = event.charactersIgnoringModifiers.lowercaseString;
    if (modifiers == (NSEventModifierFlagCommand | NSEventModifierFlagShift))
        return [key isEqualToString:@"z"] ? @selector(redo:) : NULL;
    if (modifiers != NSEventModifierFlagCommand) return NULL;
    if ([key isEqualToString:@"c"]) return @selector(copy:);
    if ([key isEqualToString:@"v"]) return @selector(paste:);
    if ([key isEqualToString:@"x"]) return @selector(cut:);
    if ([key isEqualToString:@"a"]) return @selector(selectAll:);
    if ([key isEqualToString:@"z"]) return @selector(undo:);
    return NULL;
}

static NSEvent *routeEditingEvent(NSEvent *event, NSWindow *keyWindow) {
    if (event.type != NSEventTypeKeyDown || !keyWindow ||
        ![keyWindow.title isEqualToString:@"MIDI Journey 2"]) return event;
    SEL action = editingAction(event);
    if (!action) return event;
    NSResponder *responder = keyWindow.firstResponder;
    Class browserClass = NSClassFromString(@"RenderWidgetHostViewCocoa");
    // Fail closed if a future Chromium changes the native view. Never fall
    // through the responder chain to Live's own copy/paste/undo actions.
    if (!browserClass || ![responder isKindOfClass:browserClass] ||
        ![responder respondsToSelector:action]) return event;
    return [NSApp sendAction:action to:responder from:nil] ? nil : event;
}

#ifndef MIDIJOURNEY_SHORTCUT_TEST
static t_class *shortcutClass;
static id monitor;
static NSTimer *windowTimer;
static NSUInteger instances;
typedef struct { t_object object; } ShortcutObject;
#endif

static NSMapTable<NSWindow *, NSDictionary *> *windowDefaults;

static BOOL containsBrowser(NSView *view) {
    Class browserClass = NSClassFromString(@"RenderWidgetHostViewCocoa");
    if (browserClass && [view isKindOfClass:browserClass]) return YES;
    for (NSView *child in view.subviews)
        if (containsBrowser(child)) return YES;
    return NO;
}

static void initializeWindowSize(NSWindow *window) {
    NSRect frame = window.frame;
    NSRect screen = (window.screen ?: NSScreen.mainScreen).visibleFrame;
    NSSize content = MJInitialWindowSize;
    window.styleMask |= NSWindowStyleMaskResizable;
    window.contentMinSize = NSMakeSize(420, 324);
    window.contentMaxSize = NSMakeSize(720, 1400);
    NSRect target = [window frameRectForContentRect:NSMakeRect(0,0,content.width,content.height)];
    target = MJFitFrame(frame, target.size, screen);
    [window setFrame:target display:YES];
}
static void keepEditorsVisible(void) {
    for (NSWindow *window in NSApp.windows) {
        if (![window.title isEqualToString:@"MIDI Journey 2"] ||
            !containsBrowser(window.contentView)) continue;
        if (![windowDefaults objectForKey:window]) {
            [windowDefaults setObject:@{@"hide":@(window.hidesOnDeactivate), @"style":@(window.styleMask),
                @"minimizeHidden":@([window standardWindowButton:NSWindowMiniaturizeButton].hidden),
                @"zoomHidden":@([window standardWindowButton:NSWindowZoomButton].hidden),
                @"min":[NSValue valueWithSize:window.contentMinSize], @"max":[NSValue valueWithSize:window.contentMaxSize]} forKey:window];
            // Initialize this editor once. Max retains its native frame when
            // hidden/reopened; never reapply geometry or another editor's size.
            initializeWindowSize(window);
        }
        window.hidesOnDeactivate = NO;
        // Max's nozoom/nominimize flags leave disabled circles on macOS.
        // Keep the native close button and draggable title bar, hide only these.
        [window standardWindowButton:NSWindowMiniaturizeButton].hidden = YES;
        [window standardWindowButton:NSWindowZoomButton].hidden = YES;
    }
}
#ifndef MIDIJOURNEY_SHORTCUT_TEST
static void shortcutFree(ShortcutObject *object) {
    if (instances && --instances == 0 && monitor) {
        [NSEvent removeMonitor:monitor];
        monitor = nil;
        [windowTimer invalidate];
        windowTimer = nil;
        for (NSWindow *window in windowDefaults) {
            NSDictionary *saved = [windowDefaults objectForKey:window];
            window.hidesOnDeactivate = [saved[@"hide"] boolValue];
            window.styleMask = [saved[@"style"] unsignedLongValue];
            [window standardWindowButton:NSWindowMiniaturizeButton].hidden = [saved[@"minimizeHidden"] boolValue];
            [window standardWindowButton:NSWindowZoomButton].hidden = [saved[@"zoomHidden"] boolValue];
            window.contentMinSize = [saved[@"min"] sizeValue];
            window.contentMaxSize = [saved[@"max"] sizeValue];
        }
        windowDefaults = nil;
    }
}
static void *shortcutNew(void) {
    ShortcutObject *object = object_alloc(shortcutClass);
    if (!object) return NULL;
    if (instances++ == 0) {
        windowDefaults = [NSMapTable weakToStrongObjectsMapTable];
        windowTimer = [NSTimer timerWithTimeInterval:0.25 repeats:YES
            block:^(NSTimer *timer) { keepEditorsVisible(); }];
        [[NSRunLoop mainRunLoop] addTimer:windowTimer forMode:NSRunLoopCommonModes];
        monitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskKeyDown
            handler:^NSEvent *(NSEvent *event) {
                return routeEditingEvent(event, NSApp.keyWindow);
            }];
    }
    return object;
}
void ext_main(void *module) {
    shortcutClass = class_new(MIDIJOURNEY_SHORTCUT_CLASS, (method)shortcutNew,
        (method)shortcutFree, sizeof(ShortcutObject), NULL, 0);
    class_register(CLASS_BOX, shortcutClass);
}
#endif
