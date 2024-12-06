# Parameter Help Implementation Plan

## 1. Location Tracking During Parsing

### Add Location Tracking to AST
```typescript
interface ModuleCallLocation {
  moduleName: string;
  nameRange: Range;        // Range of module name
  fullRange: Range;        // Full range including braces
  parameters: {
    name?: string;         // Parameter name if named
    range: Range;          // Range of parameter value
    nameRange?: Range;     // Range of parameter name if named
  }[];
  complete: boolean;       // False if parsing ended mid-call
}

interface Range {
  from: number;  // Absolute document position
  to: number;
}
```

### Parser Changes
1. Modify Parser class to maintain location stack:
   ```typescript
   class Parser {
     private locations: ModuleCallLocation[] = [];
     private currentCall: ModuleCallLocation | null = null;
   
     private beginModuleCall(name: string, nameRange: Range) {
       this.currentCall = {
         moduleName: name,
         nameRange,
         fullRange: { from: nameRange.from, to: -1 }, // to be filled in
         parameters: [],
         complete: false
       };
     }
   
     private addParameter(value: Range, name?: string, nameRange?: Range) {
       if (this.currentCall) {
         this.currentCall.parameters.push({ range: value, name, nameRange });
       }
     }
   
     private endModuleCall(endPos: number) {
       if (this.currentCall) {
         this.currentCall.fullRange.to = endPos;
         this.currentCall.complete = true;
         this.locations.push(this.currentCall);
         this.currentCall = null;
       }
     }
   }
   ```

2. Integrate into existing parsing:
   - Call `beginModuleCall` when module name is parsed
   - Call `addParameter` for each parameter
   - Call `endModuleCall` when closing parenthesis found
   - Handle errors by keeping incomplete calls in locations list

## 2. Location Lookup

No special logic is necessary for an efficient lookup: we can just scan through the list.
Lookup is only necessary when we move the cursor, and a module is maybe a few kb.
We can scan a few kb every keypress, no problem.

```typescript
  findCallAtPosition(pos: number): ModuleCallLocation | null;

  findParameterAtPosition(pos: number): {
    call: ModuleCallLocation,
    parameterIndex: number,
    inName: boolean
  } | null;
```

## 3. Editor Integration

1. Create parameter help widget:
```typescript
class ParameterHelpWidget extends WidgetType {
  constructor(
    private call: ModuleCallLocation,
    private currentParam: number
  ) {}

  toDOM() {
    const container = document.createElement('div');
    container.className = 'parameter-help';
    // Populate with module docs, highlighting current parameter
    return container;
  }
}
```

2. Add decoration field to track help state:
```typescript
const parameterHelpField = StateField.define<DecorationSet>({
  create() { return Decoration.none; },
  update(helpState, tr) {
    if (!tr.docChanged && !tr.selection) return helpState;
    
    const pos = tr.selection?.main.head;
    if (!pos) return Decoration.none;

    const locations = getLocationsFromParser(tr.state.doc);
    const index = new LocationIndex(locations);
    const found = index.findParameterAtPosition(pos);
    
    if (!found) return Decoration.none;
    
    return Decoration.set([
      Decoration.widget({
        widget: new ParameterHelpWidget(found.call, found.parameterIndex),
        side: 1
      }).range(pos)
    ]);
  }
});
```

## 4. Performance Considerations

1. Cache parsed locations: Not necessary; we reparse everything anyway. Parser is fast.
2. Use line-based indexing for faster lookups.
3. Debounce updates: reuse widget DOM elements to reduce flicker.

## 5. Error Handling

1. Handle incomplete calls:
   - Treat as extending to end of line
   - Show parameter help even if syntax invalid
   - Indicate incomplete state in UI

2. Graceful degradation:
   - Show basic help if location info unavailable
   - Fall back to module name only if parameter info missing

## Implementation Order

1. Add location tracking to parser
2. Build and test location index
3. Create basic parameter help widget
4. Add editor integration
5. Add caching and performance optimizations
6. Polish UI and error handling
