module.exports.event = {
  Error: 0,
  Reply: 1,

{{each(i, eventName) Object.keys(events)}}
  ${eventName}: ${events[eventName].number},
{{if eventcopy[eventName] }}
  ${eventcopy[eventName].name}: ${eventcopy[eventName].number},
{{/if}}
{{/each}}
  GenericEvent: 35,

  names: [
    "Error", "Reply", "KeyPress", "KeyRelease",
    "ButtonPress", "ButtonRelease", "MotionNotify", "EnterNotify",
    "LeaveNotify", "FocusIn", "FocusOut", "KeymapNotify",
    "Expose", "GraphicsExpose", "NoExpose", "VisibilityNotify",
    "CreateNotify", "DestroyNotify", "UnmapNotify",
    "MapNotify", "MapRequest", "ReparentNotify", "ConfigureNotify",
    "ConfigureRequest", "GravityNotify", "ResizeRequest",
    "CirculateNotify", "CirculateRequest", "PropertyNotify",
    "SelectionClear", "SelectionRequest", "SelectionNotify",
    "ColormapNotify", "ClientMessage", "MappingNotify", "GenericEvent"
  ],

  template: {
    Error: ['C code', 'S seq', 'L bad_value', 'C minor_opcode', 'S major_opcode'],
{{each(i, eventName) Object.keys(events)}}
  ${eventName}: [
        {{each(j, f) events[eventName].field}}{{if !(f.fieldType=="pad" && (j+1)==events[eventName].field.length)}}'${getBufPack(f)} ${fieldName(f)}', {{/if}}{{if !events[eventName]['no-sequence-number'] && j===0}}'S seq',{{/if}}{{/each}}],
{{if eventcopy[eventName] }}
  ${eventcopy[eventName].name}: [
        {{each(j, f) events[eventName].field}}{{if !(f.fieldType=="pad" && (j+1)==events[eventName].field.length)}}'${getBufPack(f)} ${fieldName(f)}', {{/if}}{{if !events[eventName]['no-sequence-number'] && j===0}}'S seq',{{/if}}{{/each}}],
{{/if}}
{{/each}}
  }
}

