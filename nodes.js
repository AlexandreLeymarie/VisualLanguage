
class NumberType{}
class StringType{}
class BoolType{}
class ControlType{}

const DIRECTIONS = {OUTPUT: "OUTPUT", INPUT: "INPUT"};

class TypeVariable{
    constructor(name = "T"){
        this.name = name;
        this.slots = new Set();
    }
}

function resolveTypeVariable(typeVariable, ignoredInputSlot = null){
    const visitedVariables = new Set();
    const pendingVariables = [typeVariable];
    let resolvedType = null;
    while(pendingVariables.length > 0){
        const variable = pendingVariables.pop();
        if(visitedVariables.has(variable)) continue;
        visitedVariables.add(variable);
        for(const slot of variable.slots){
            if(slot === ignoredInputSlot) continue;
            for(const connectedSlot of slot.connectedSlots){
                if(connectedSlot === ignoredInputSlot) continue;
                if(connectedSlot.type === ControlType) return {type: null, conflict: true};
                if(connectedSlot.type instanceof TypeVariable){
                    pendingVariables.push(connectedSlot.type);
                } else if(resolvedType !== null && resolvedType !== connectedSlot.type){
                    return {type: null, conflict: true};
                } else {
                    resolvedType = connectedSlot.type;
                }
            }
        }
    }
    return {type: resolvedType, conflict: false};
}

function isValidNumberString(value){
    return value.trim() !== "" && Number.isFinite(Number(value));
}

function getPromptFlowConnectionError(firstSlot, secondSlot){
    const inputSlot = firstSlot.direction === DIRECTIONS.INPUT ? firstSlot : secondSlot;
    const replacedInput = inputSlot.type !== ControlType && inputSlot.connectedSlots.length > 0
        ? inputSlot
        : null;
    const getConnections = slot => {
        const connections = slot.connectedSlots.filter(connectedSlot =>
            replacedInput === null || (slot !== replacedInput && connectedSlot !== replacedInput)
        );
        const candidate = slot === firstSlot ? secondSlot : slot === secondSlot ? firstSlot : null;
        if(candidate !== null && !connections.includes(candidate)) connections.push(candidate);
        return connections;
    };

    const nodes = new Set();
    const pendingNodes = [firstSlot.node, secondSlot.node];
    while(pendingNodes.length > 0){
        const node = pendingNodes.pop();
        if(nodes.has(node)) continue;
        nodes.add(node);
        for(const slot of node.slots){
            for(const connectedSlot of getConnections(slot)) pendingNodes.push(connectedSlot.node);
        }
    }

    const isControlNode = node => node.slots.some(slot => slot.type === ControlType);
    for(const promptNode of nodes){
        if(!(promptNode instanceof PromptNode)) continue;
        const firstControlNodes = new Set();
        const visitedDataOutputs = new Set();
        const pendingDataOutputs = [promptNode.valueSlot];
        while(pendingDataOutputs.length > 0){
            const outputSlot = pendingDataOutputs.pop();
            if(visitedDataOutputs.has(outputSlot)) continue;
            visitedDataOutputs.add(outputSlot);
            for(const input of getConnections(outputSlot)){
                if(input.direction !== DIRECTIONS.INPUT || input.type === ControlType) continue;
                if(isControlNode(input.node)){
                    firstControlNodes.add(input.node);
                    continue;
                }
                for(const output of input.node.getOutputSlots()){
                    if(output.type !== ControlType) pendingDataOutputs.push(output);
                }
            }
        }

        for(const controlNode of firstControlNodes){
            for(const startNode of nodes){
                if(!(startNode instanceof StartNode)) continue;
                const visitedControlNodes = new Set();
                const pendingControlNodes = [startNode];
                while(pendingControlNodes.length > 0){
                    const currentNode = pendingControlNodes.pop();
                    if(currentNode === promptNode || visitedControlNodes.has(currentNode)) continue;
                    if(currentNode === controlNode){
                        return "This prompt value may be used before the prompt runs; every control path to its first consumer must pass through this prompt.";
                    }
                    visitedControlNodes.add(currentNode);
                    for(const output of currentNode.getOutputSlots()){
                        if(output.type !== ControlType) continue;
                        for(const connectedSlot of getConnections(output)){
                            if(connectedSlot.direction === DIRECTIONS.INPUT && connectedSlot.type === ControlType){
                                pendingControlNodes.push(connectedSlot.node);
                            }
                        }
                    }
                }
            }
        }
    }
    return null;
}

class Slot{
    constructor(node, type, direction, name = null, doc = null){
        this.node = node;
        this.type = type;
        this.name = name;
        this.doc = doc;
        this.direction = direction;
        this.value = null;
        if(type instanceof TypeVariable) type.slots.add(this);
        
        this.connectedSlots = [];
    }
    connect(slot){
        if(!this.canConnectToSlot(slot)) return false;

        const inputSlot = this.direction === DIRECTIONS.INPUT ? this : slot;
        if(inputSlot.type !== ControlType && inputSlot.connectedSlots.length > 0){
            inputSlot.disconnect();
        }

        if(!this.connectedSlots.includes(slot)) this.connectedSlots.push(slot);
        if(!slot.connectedSlots.includes(this)) slot.connectedSlots.push(this);
        return true;
    }
    disconnect(slot = null){
        const slotsToDisconnect = slot === null ? [...this.connectedSlots] : [slot];
        for(let connectedSlot of slotsToDisconnect){
            this.connectedSlots = this.connectedSlots.filter(connected => connected !== connectedSlot);
            connectedSlot.connectedSlots = connectedSlot.connectedSlots.filter(connected => connected !== this);
        }
    }
    canConnectToSlot(slot){
        return this.getConnectionError(slot) === null;
    }
    getConnectionError(slot){
        if(!(slot instanceof Slot)) return "A slot cannot connect to a non-slot target.";
        if(slot === this) return "A slot cannot connect to itself.";
        if(slot.direction === this.direction){
            const direction = this.direction === DIRECTIONS.INPUT ? "input" : "output";
            return `An ${direction} slot cannot connect to another ${direction} slot.`;
        }
        const inputSlot = this.direction === DIRECTIONS.INPUT ? this : slot;
        if((this.type instanceof TypeVariable && slot.type === ControlType) ||
           (slot.type instanceof TypeVariable && this.type === ControlType)){
            return "A type variable can only connect to data slots, not control slots.";
        }
        const thisType = this.getResolvedType(inputSlot.type === ControlType ? null : inputSlot);
        const otherType = slot.getResolvedType(inputSlot.type === ControlType ? null : inputSlot);
        if(this.getTypeResolutionConflict(inputSlot) || slot.getTypeResolutionConflict(inputSlot) ||
           (thisType !== null && otherType !== null && thisType !== otherType)){
            const sourceType = (thisType || this.type).name.replace(/Type$/, "").toLowerCase();
            const targetType = (otherType || slot.type).name.replace(/Type$/, "").toLowerCase();
            return `Slot types must match; this connection pairs a ${sourceType} slot with a ${targetType} slot.`;
        }
        if(this.direction === DIRECTIONS.INPUT){
            const promptFlowError = getPromptFlowConnectionError(slot, this);
            if(promptFlowError !== null) return promptFlowError;
        } else {
            const promptFlowError = getPromptFlowConnectionError(this, slot);
            if(promptFlowError !== null) return promptFlowError;
        }
        return null;
    }
    getResolvedType(ignoredInputSlot = null){
        if(!(this.type instanceof TypeVariable)) return this.type;
        return resolveTypeVariable(this.type, ignoredInputSlot).type;
    }
    getTypeResolutionConflict(ignoredInputSlot = null){
        return this.type instanceof TypeVariable &&
            resolveTypeVariable(this.type, ignoredInputSlot).conflict;
    }
    getTypeName(){
        const resolvedType = this.getResolvedType();
        if(resolvedType === null && this.type instanceof TypeVariable) return this.type.name;
        const type = resolvedType || this.type;
        return type.name.replace(/Type$/, "").toLowerCase();
    }
    getValue(){
        if(this.direction == DIRECTIONS.INPUT){
            if(this.connectedSlots.length > 0) return this.connectedSlots[0].getValue();
            return null;
        } else {
            this.node.computeData?.();
            return this.value;
        }
    }
}

class Node{
    slots = [];
    name = "";
    doc = null;
    getInputSlots(){
        let res = [];
        for(let slot of this.slots){
            if(slot.direction == DIRECTIONS.INPUT){
                res.push(slot);
            }
        }
        return res;
    }
    getOutputSlots(){
        let res = [];
        for(let slot of this.slots){
            if(slot.direction == DIRECTIONS.OUTPUT){
                res.push(slot);
            }
        }
        return res;
    }
    resetCachedValues(){
        if(typeof this.computeData !== "function") return;
        for(const slot of this.getOutputSlots()) slot.value = null;
    }
    resetCachedDependents(outputSlot){
        const visitedNodes = new Set([this]);
        const pendingOutputs = [outputSlot];
        while(pendingOutputs.length > 0){
            const currentOutput = pendingOutputs.pop();
            for(const connectedSlot of currentOutput.connectedSlots){
                if(connectedSlot.direction !== DIRECTIONS.INPUT || connectedSlot.type === ControlType) continue;
                const dependentNode = connectedSlot.node;
                if(visitedNodes.has(dependentNode)) continue;
                visitedNodes.add(dependentNode);
                dependentNode.resetCachedValues();
                for(const dependentOutput of dependentNode.getOutputSlots()){
                    if(dependentOutput.type !== ControlType) pendingOutputs.push(dependentOutput);
                }
            }
        }
    }
}

class NumberNode extends Node{
    static displayName = "Number";
    constructor(value){
        super();
        this.name = String(value);
        this.valueSlot = new Slot(this, NumberType, DIRECTIONS.OUTPUT);
        this.valueSlot.value = value;
        this.slots = [this.valueSlot];
    }
}

class RandomNode extends Node{
    static displayName = "random";
    constructor(){
        super();
        this.name = "random";
        this.valueSlot = new Slot(this, NumberType, DIRECTIONS.OUTPUT);
        this.slots = [this.valueSlot];
    }
    computeData(){
        if(this.valueSlot.value === null){
            this.valueSlot.value = Math.random();
        }
    }
}

class StringNode extends Node{
    static displayName = "String";
    constructor(value){
        super();
        this.name = value === "" ? '""' : value;
        this.valueSlot = new Slot(this, StringType, DIRECTIONS.OUTPUT);
        this.valueSlot.value = value;
        this.slots = [this.valueSlot];
    }
}

class AddNode extends Node{
    constructor(){
        super();
        this.name = "+";
        this.aSlot = new Slot(this, NumberType, DIRECTIONS.INPUT);
        this.bSlot = new Slot(this, NumberType, DIRECTIONS.INPUT);
        this.sumSlot = new Slot(this, NumberType, DIRECTIONS.OUTPUT);

        this.slots = [this.aSlot, this.bSlot, this.sumSlot];
    }

    computeData(){
        let a = this.aSlot.getValue();
        let b = this.bSlot.getValue();
        if(a === null || b === null) return;
        if(this.sumSlot.value == null){
            this.sumSlot.value = a + b;
        }
    }

}

class MultiplicationNode extends Node{
    static displayName = "×";
    constructor(){
        super();
        this.name = "×";
        this.aSlot = new Slot(this, NumberType, DIRECTIONS.INPUT);
        this.bSlot = new Slot(this, NumberType, DIRECTIONS.INPUT);
        this.productSlot = new Slot(this, NumberType, DIRECTIONS.OUTPUT);
        this.slots = [this.aSlot, this.bSlot, this.productSlot];
    }
    computeData(){
        const a = this.aSlot.getValue();
        const b = this.bSlot.getValue();
        if(a === null || b === null) return;
        if(this.productSlot.value === null){
            this.productSlot.value = a * b;
        }
    }
}

class EqualityNode extends Node{
    constructor(){
        super();
        this.name = "=";
        this.aSlot = new Slot(this, NumberType, DIRECTIONS.INPUT);
        this.bSlot = new Slot(this, NumberType, DIRECTIONS.INPUT);
        this.outputSlot = new Slot(this, BoolType, DIRECTIONS.OUTPUT);

        this.slots = [this.aSlot, this.bSlot, this.outputSlot];
    }

    computeData(){
        let a = this.aSlot.getValue();
        let b = this.bSlot.getValue();
        if(a === null || b === null) return;
        if(this.outputSlot.value == null){
            this.outputSlot.value = (a === b);
        }
    }

}

class GreaterThanNode extends Node{
    constructor(){
        super();
        this.name = "a > b";
        this.aSlot = new Slot(this, NumberType, DIRECTIONS.INPUT, "a");
        this.bSlot = new Slot(this, NumberType, DIRECTIONS.INPUT, "b");
        this.outputSlot = new Slot(this, BoolType, DIRECTIONS.OUTPUT);
        this.slots = [this.aSlot, this.bSlot, this.outputSlot];
    }
    computeData(){
        const a = this.aSlot.getValue();
        const b = this.bSlot.getValue();
        if(a === null || b === null) return;
        if(this.outputSlot.value === null){
            this.outputSlot.value = a > b;
        }
    }
}

class LessThanNode extends Node{
    constructor(){
        super();
        this.name = "a < b";
        this.aSlot = new Slot(this, NumberType, DIRECTIONS.INPUT, "a");
        this.bSlot = new Slot(this, NumberType, DIRECTIONS.INPUT, "b");
        this.outputSlot = new Slot(this, BoolType, DIRECTIONS.OUTPUT);
        this.slots = [this.aSlot, this.bSlot, this.outputSlot];
    }
    computeData(){
        const a = this.aSlot.getValue();
        const b = this.bSlot.getValue();
        if(a === null || b === null) return;
        if(this.outputSlot.value === null){
            this.outputSlot.value = a < b;
        }
    }
}

class NumberToStringNode extends Node{
    constructor(){
        super();
        this.name = "to string";
        this.inputSlot = new Slot(this, NumberType, DIRECTIONS.INPUT);
        this.outputSlot = new Slot(this, StringType, DIRECTIONS.OUTPUT);
        this.slots = [this.inputSlot, this.outputSlot];
    }
    computeData(){
        let n = this.inputSlot.getValue();
        if(n === null) return;
        this.outputSlot.value = String(n);
    }
}

class StringToNumberNode extends Node{
    static displayName = "to number";
    constructor(){
        super();
        this.name = "to number";
        this.inputSlot = new Slot(this, StringType, DIRECTIONS.INPUT);
        this.outputSlot = new Slot(this, NumberType, DIRECTIONS.OUTPUT);
        this.slots = [this.inputSlot, this.outputSlot];
    }
    computeData(){
        const value = this.inputSlot.getValue();
        if(value === null) return;
        const number = Number(value);
        if(!isValidNumberString(value)){
            throw new Error(`Cannot convert ${JSON.stringify(value)} to a number.`);
        }
        this.outputSlot.value = number;
    }
}

class IsNumberNode extends Node{
    static displayName = "Is number";
    constructor(){
        super();
        this.name = "is number";
        this.inputSlot = new Slot(this, StringType, DIRECTIONS.INPUT);
        this.outputSlot = new Slot(this, BoolType, DIRECTIONS.OUTPUT);
        this.slots = [this.inputSlot, this.outputSlot];
    }
    computeData(){
        const value = this.inputSlot.getValue();
        if(value === null) return;
        this.outputSlot.value = isValidNumberString(value);
    }
}

class FloorNode extends Node{
    static displayName = "Floor";
    constructor(){
        super();
        this.name = "floor";
        this.inputSlot = new Slot(this, NumberType, DIRECTIONS.INPUT);
        this.outputSlot = new Slot(this, NumberType, DIRECTIONS.OUTPUT);
        this.slots = [this.inputSlot, this.outputSlot];
    }
    computeData(){
        const value = this.inputSlot.getValue();
        if(value === null) return;
        this.outputSlot.value = Math.floor(value);
    }
}

class PromptNode extends Node{
    static displayName = "Prompt";
    constructor(){
        super();
        this.name = "prompt";
        this.controlInputSlot = new Slot(this, ControlType, DIRECTIONS.INPUT);
        this.valueSlot = new Slot(this, StringType, DIRECTIONS.OUTPUT);
        this.controlOutputSlot = new Slot(this, ControlType, DIRECTIONS.OUTPUT);
        this.slots = [this.controlInputSlot, this.valueSlot, this.controlOutputSlot];
    }
    execute(){
        this.valueSlot.value = null;
        const value = window.prompt("Enter a string:");
        this.valueSlot.value = value ?? "";
        this.resetCachedDependents(this.valueSlot);
        for(const connectedSlot of [...this.controlOutputSlot.connectedSlots]){
            connectedSlot.node.execute(connectedSlot);
        }
    }
}

class PrintNode extends Node{
    constructor(){
        super();
        this.name = "print";
        this.valueSlot = new Slot(this, StringType, DIRECTIONS.INPUT);
        this.controlInputSlot = new Slot(this, ControlType, DIRECTIONS.INPUT);
        this.controlOutputSlot = new Slot(this, ControlType, DIRECTIONS.OUTPUT);
        this.slots = [this.valueSlot, this.controlInputSlot, this.controlOutputSlot];
    }
    execute(){
        let value = this.valueSlot.getValue();
        if(value === null) return;
        console.log(value);
        window.alert(value);
        for(let connectedSlot of [...this.controlOutputSlot.connectedSlots]){
            connectedSlot.node.execute(connectedSlot);
        }
    }
}

class SplitNode extends Node{
    constructor(){
        super();
        this.name = "split"
        this.conditionSlot = new Slot(this, BoolType, DIRECTIONS.INPUT);
        this.controlInputSlot = new Slot(this, ControlType, DIRECTIONS.INPUT);
        this.trueOutputSlot = new Slot(this, ControlType, DIRECTIONS.OUTPUT, "true");
        this.falseOutputSlot = new Slot(this, ControlType, DIRECTIONS.OUTPUT, "false");
        this.slots = [this.conditionSlot, this.controlInputSlot, this.trueOutputSlot, this.falseOutputSlot];
    }
    execute(){
        let value = this.conditionSlot.getValue();
        if(value === null) return;
        if(value){
            for(let connectedSlot of [...this.trueOutputSlot.connectedSlots]){
                connectedSlot.node.execute(connectedSlot);
            }
        } else {
            for(let connectedSlot of [...this.falseOutputSlot.connectedSlots]){
                connectedSlot.node.execute(connectedSlot);
            }
        }
    }
}

class ChooseNode extends Node{
    static displayName = "Choose";
    constructor(){
        super();
        this.name = "choose";
        const choiceType = new TypeVariable("T");
        this.conditionSlot = new Slot(this, BoolType, DIRECTIONS.INPUT, "condition");
        this.trueSlot = new Slot(this, choiceType, DIRECTIONS.INPUT, "true");
        this.falseSlot = new Slot(this, choiceType, DIRECTIONS.INPUT, "false");
        this.outputSlot = new Slot(this, choiceType, DIRECTIONS.OUTPUT);
        this.slots = [this.conditionSlot, this.trueSlot, this.falseSlot, this.outputSlot];
    }
    computeData(){
        const condition = this.conditionSlot.getValue();
        if(condition === null) return;
        const selectedSlot = condition ? this.trueSlot : this.falseSlot;
        const value = selectedSlot.getValue();
        if(value === null) return;
        this.outputSlot.value = value;
    }
}

class ForceComputeNode extends Node{
    static displayName = "Force compute";
    constructor(){
        super();
        this.name = "force compute";
        const valueType = new TypeVariable("T");
        this.controlInputSlot = new Slot(this, ControlType, DIRECTIONS.INPUT);
        this.valueInputSlot = new Slot(this, valueType, DIRECTIONS.INPUT);
        this.valueOutputSlot = new Slot(this, valueType, DIRECTIONS.OUTPUT);
        this.controlOutputSlot = new Slot(this, ControlType, DIRECTIONS.OUTPUT);
        this.slots = [
            this.controlInputSlot,
            this.valueInputSlot,
            this.valueOutputSlot,
            this.controlOutputSlot
        ];
    }
    computeData(){
        const value = this.valueInputSlot.getValue();
        if(value === null) return;
        this.valueOutputSlot.value = value;
    }
    execute(){
        this.valueOutputSlot.value = null;
        this.computeData();
        for(const connectedSlot of [...this.controlOutputSlot.connectedSlots]){
            connectedSlot.node.execute(connectedSlot);
        }
    }
}

const USER_FUNCTION_DEFINITIONS = new Map();

class DataSlotNode extends Node{
    static displayName = "Data slot";
    constructor(name = ""){
        super();
        this.name = name;
        this.valueType = new TypeVariable("T");
        this.valueInputSlot = new Slot(this, this.valueType, DIRECTIONS.INPUT);
        this.valueOutputSlot = new Slot(this, this.valueType, DIRECTIONS.OUTPUT);
        this.boundaryPortId = null;
        this.boundaryDirection = null;
        this.runtimeContext = null;
        this.isBoundInput = false;
        this.boundValue = null;
        this.slots = [this.valueInputSlot, this.valueOutputSlot];
    }
    computeData(){
        if(this.isBoundInput){
            this.valueOutputSlot.value = this.boundValue;
            return;
        }
        this.valueOutputSlot.value = this.valueInputSlot.getValue();
    }
    resetCachedValues(){
        super.resetCachedValues();
        if(this.boundaryDirection === "output") this.runtimeContext?.resetOutput(this.boundaryPortId);
    }
    getPortName(){
        return this.name;
    }
}

class ControlSlotNode extends Node{
    static displayName = "Control slot";
    constructor(name = ""){
        super();
        this.name = name;
        this.controlInputSlot = new Slot(this, ControlType, DIRECTIONS.INPUT);
        this.controlOutputSlot = new Slot(this, ControlType, DIRECTIONS.OUTPUT);
        this.boundaryPortId = null;
        this.boundaryDirection = null;
        this.runtimeContext = null;
        this.slots = [this.controlInputSlot, this.controlOutputSlot];
    }
    getPortName(){
        return this.name;
    }
    execute(){
        if(this.boundaryDirection === "output"){
            this.runtimeContext?.forwardControl(this.boundaryPortId);
            return;
        }
        for(const connectedSlot of [...this.controlOutputSlot.connectedSlots]){
            connectedSlot.node.execute(connectedSlot);
        }
    }
}

class UserFunctionNode extends Node{
    constructor(functionId){
        super();
        this.functionId = functionId;
        this.runtimeFrame = null;
        this.name = USER_FUNCTION_DEFINITIONS.get(functionId)?.name || "function";
        this.rebuildSlots();
    }
    rebuildSlots(){
        const definition = USER_FUNCTION_DEFINITIONS.get(this.functionId);
        if(!definition) return;
        this.name = definition.name;
        const variables = new Map();
        this.slots = definition.ports.map(port => {
            let type = port.type;
            if(type instanceof TypeVariable){
                if(!variables.has(port.typeVariableName || type.name)){
                    variables.set(port.typeVariableName || type.name, new TypeVariable(port.typeVariableName || type.name));
                }
                type = variables.get(port.typeVariableName || type.name);
            }
            return new Slot(this, type, port.direction === "input" ? DIRECTIONS.INPUT : DIRECTIONS.OUTPUT, port.name || null);
        });
    }
    getRuntimeFrame(){
        const definition = USER_FUNCTION_DEFINITIONS.get(this.functionId);
        if(!definition) throw new Error(`Missing function definition ${this.functionId}.`);
        if(!this.runtimeFrame) this.runtimeFrame = cloneFunctionFrame(definition);
        return this.runtimeFrame;
    }
    resetCachedValues(){
        this.runtimeFrame = null;
        super.resetCachedValues();
    }
    bindDataInputs(frame){
        const definition = USER_FUNCTION_DEFINITIONS.get(this.functionId);
        definition.ports.forEach((port, index) => {
            if(port.direction !== "input" || port.type === ControlType) return;
            const boundary = frame.boundaries.get(port.id);
            if(boundary instanceof DataSlotNode){
                boundary.isBoundInput = true;
                boundary.boundValue = this.slots[index].getValue();
            }
        });
    }
    attachRuntimeContext(frame){
        const definition = USER_FUNCTION_DEFINITIONS.get(this.functionId);
        const context = {
            forwardControl: portId => {
                const index = definition.ports.findIndex(port => port.id === portId);
                for(const connectedSlot of [...this.slots[index].connectedSlots]) connectedSlot.node.execute(connectedSlot);
            },
            resetOutput: portId => {
                const index = definition.ports.findIndex(port => port.id === portId);
                const outputSlot = this.slots[index];
                if(!outputSlot) return;
                outputSlot.value = null;
                this.resetCachedDependents(outputSlot);
            }
        };
        for(const boundary of frame.boundaries.values()){
            boundary.runtimeContext = context;
        }
    }
    computeData(){
        const definition = USER_FUNCTION_DEFINITIONS.get(this.functionId);
        if(!definition) return;
        const frame = this.getRuntimeFrame();
        this.attachRuntimeContext(frame);
        this.bindDataInputs(frame);
        definition.ports.forEach((port, index) => {
            if(port.direction !== "output" || port.type === ControlType) return;
            const boundary = frame.boundaries.get(port.id);
            const value = boundary?.valueInputSlot.getValue() ?? null;
            this.slots[index].value = value;
        });
    }
    execute(inputSlot = null){
        const definition = USER_FUNCTION_DEFINITIONS.get(this.functionId);
        if(!definition) return;
        const frame = this.getRuntimeFrame();
        this.bindDataInputs(frame);
        this.attachRuntimeContext(frame);
        const inputIndex = inputSlot ? this.slots.indexOf(inputSlot) : -1;
        definition.ports.forEach((port, index) => {
            if(port.direction !== "input" || port.type !== ControlType) return;
            if(inputSlot && index !== inputIndex) return;
            frame.boundaries.get(port.id)?.execute();
        });
    }
}

class FunctionDefinition{
    constructor(id, name, nodes, ports, bounds, visuals){
        this.id = id;
        this.name = name;
        this.nodes = nodes;
        this.ports = ports;
        this.bounds = bounds;
        this.visuals = visuals;
    }
}

function cloneFunctionFrame(definition){
    const nodes = [];
    const boundaries = new Map();
    const originals = definition.nodes;
    const mapping = new Map();
    for(const original of originals){
        let clone;
        if(original instanceof NumberNode) clone = new NumberNode(original.valueSlot.value);
        else if(original instanceof StringNode) clone = new StringNode(original.valueSlot.value);
        else if(original instanceof DataSlotNode){
            clone = new DataSlotNode(original.name);
            clone.boundaryDirection = original.boundaryDirection;
            clone.boundaryPortId = original.boundaryPortId;
            if(original.boundaryPortId) boundaries.set(original.boundaryPortId, clone);
        } else if(original instanceof ControlSlotNode){
            clone = new ControlSlotNode(original.name);
            clone.boundaryDirection = original.boundaryDirection;
            clone.boundaryPortId = original.boundaryPortId;
            if(original.boundaryPortId) boundaries.set(original.boundaryPortId, clone);
        } else if(original instanceof UserFunctionNode){
            clone = new UserFunctionNode(original.functionId);
        } else {
            clone = new original.constructor();
        }
        mapping.set(original, clone);
        nodes.push(clone);
    }
    for(const original of originals){
        const clone = mapping.get(original);
        for(const slot of original.slots){
            if(slot.direction !== DIRECTIONS.OUTPUT) continue;
            const cloneSlot = clone.slots[original.slots.indexOf(slot)];
            for(const target of slot.connectedSlots){
                const targetSlot = mapping.get(target.node)?.slots[target.node.slots.indexOf(target)];
                if(targetSlot) cloneSlot.connect(targetSlot);
            }
        }
    }
    return {nodes, boundaries};
}

class StartNode extends Node{
    constructor(){
        super();
        this.name = "start";
        this.controlOutputSlot = new Slot(this, ControlType, DIRECTIONS.OUTPUT);
        this.slots = [this.controlOutputSlot];
    }
    resetConnectedGraphCachedValues(){
        const visited = new Set();
        const pending = [this];
        while(pending.length > 0){
            const node = pending.pop();
            if(visited.has(node)) continue;
            visited.add(node);
            for(const slot of node.slots){
                for(const connectedSlot of slot.connectedSlots){
                    pending.push(connectedSlot.node);
                }
            }
        }
        for(const node of visited) node.resetCachedValues();
    }
    execute(){
        this.resetConnectedGraphCachedValues();
        for(let connectedSlot of [...this.controlOutputSlot.connectedSlots]){
            connectedSlot.node.execute(connectedSlot);
        }
    }
}

const NODE_TYPES = [
    NumberNode,
    RandomNode,
    StringNode,
    AddNode,
    MultiplicationNode,
    EqualityNode,
    GreaterThanNode,
    LessThanNode,
    NumberToStringNode,
    StringToNumberNode,
    IsNumberNode,
    FloorNode,
    PromptNode,
    PrintNode,
    SplitNode,
    ChooseNode,
    ForceComputeNode,
    DataSlotNode,
    ControlSlotNode
];

function serializeModel(nodes){
    const nodeIds = new Map(nodes.map((node, id) => [node, id]));
    const serializedNodes = nodes.map((node, id) => {
        const record = {id, type: node.constructor.name};
        if(node instanceof NumberNode || node instanceof StringNode){
            record.value = node.valueSlot.value;
        }
        if(node instanceof DataSlotNode || node instanceof ControlSlotNode){
            record.name = node.name;
            record.boundaryPortId = node.boundaryPortId;
            record.boundaryDirection = node.boundaryDirection;
        }
        if(node instanceof UserFunctionNode) record.functionId = node.functionId;
        return record;
    });
    const connections = [];
    for(const node of nodes){
        for(const inputSlot of node.getInputSlots()){
            for(const outputSlot of inputSlot.connectedSlots){
                if(outputSlot.direction !== DIRECTIONS.OUTPUT) continue;
                connections.push({
                    output: {
                        nodeId: nodeIds.get(outputSlot.node),
                        slot: outputSlot.node.slots.indexOf(outputSlot)
                    },
                    input: {
                        nodeId: nodeIds.get(inputSlot.node),
                        slot: inputSlot.node.slots.indexOf(inputSlot)
                    }
                });
            }
        }
    }
    return {version: 1, nodes: serializedNodes, connections};
}

function deserializeModel(modelData, {requireStart = true} = {}){
    if(modelData?.version !== 1 || !Array.isArray(modelData.nodes) ||
       !Array.isArray(modelData.connections)){
        throw new Error("Program file contains invalid model data.");
    }
    const constructors = new Map([...NODE_TYPES, StartNode, UserFunctionNode].map(NodeType => [NodeType.name, NodeType]));
    const nodesById = new Map();
    const nodeIdsByNode = new Map();
    const nodes = modelData.nodes.map((record, index) => {
        const id = record?.id ?? index;
        const NodeType = constructors.get(record?.type);
        if(!Number.isInteger(id) || nodesById.has(id) || !NodeType){
            throw new Error("Program file contains an invalid model node.");
        }
        let node;
        if(NodeType === NumberNode){
            if(!Number.isFinite(record.value)) throw new Error("Program file contains an invalid number node.");
            node = new NumberNode(record.value);
        } else if(NodeType === StringNode){
            if(typeof record.value !== "string") throw new Error("Program file contains an invalid string node.");
            node = new StringNode(record.value);
        } else if(NodeType === DataSlotNode || NodeType === ControlSlotNode){
            node = new NodeType(typeof record.name === "string" ? record.name : "slot");
            node.boundaryPortId = record.boundaryPortId || null;
            node.boundaryDirection = record.boundaryDirection || null;
        } else if(NodeType === UserFunctionNode){
            if(typeof record.functionId !== "string" || !USER_FUNCTION_DEFINITIONS.has(record.functionId)){
                throw new Error("Program file contains a function node with a missing definition.");
            }
            node = new UserFunctionNode(record.functionId);
        } else {
            node = new NodeType();
        }
        nodesById.set(id, node);
        nodeIdsByNode.set(node, id);
        return node;
    });
    if(requireStart && nodes.filter(node => node instanceof StartNode).length !== 1){
        throw new Error("A program must contain exactly one start node.");
    }

    const connections = modelData.connections.map(connection => {
        const outputRef = connection?.output;
        const inputRef = connection?.input;
        const outputNode = nodesById.get(outputRef?.nodeId ?? outputRef?.node);
        const inputNode = nodesById.get(inputRef?.nodeId ?? inputRef?.node);
        const outputSlot = outputNode?.slots[outputRef?.slot];
        const inputSlot = inputNode?.slots[inputRef?.slot];
        if(!outputSlot || !inputSlot || outputSlot.direction !== DIRECTIONS.OUTPUT ||
           inputSlot.direction !== DIRECTIONS.INPUT){
            throw new Error("Program file contains an invalid connection.");
        }
        return {outputSlot, inputSlot};
    });
    connections.sort((a, b) => Number(b.outputSlot.type === ControlType) - Number(a.outputSlot.type === ControlType));
    for(const {outputSlot, inputSlot} of connections){
        if(!outputSlot.connect(inputSlot)){
            throw new Error("Program file contains a connection that is not allowed.");
        }
    }
    return {nodes, nodesById, nodeIdsByNode};
}

function serializeFunctionDefinitions(){
    return [...USER_FUNCTION_DEFINITIONS.values()].map(definition => ({
        id: definition.id,
        name: definition.name,
        ports: definition.ports.map(port => ({
            id: port.id,
            name: port.name,
            direction: port.direction,
            type: port.type === ControlType ? "control" : port.type instanceof TypeVariable ? "type-variable" :
                port.type === NumberType ? "number" : port.type === StringType ? "string" : "bool",
            typeVariableName: port.type instanceof TypeVariable ? port.type.name : null
        })),
        model: serializeModel(definition.nodes)
    }));
}

function serializeFunctionDefinitionVisuals(){
    return [...USER_FUNCTION_DEFINITIONS.values()].map(definition => ({
        id: definition.id,
        bounds: definition.bounds,
        nodes: definition.visuals.nodes
    }));
}

function deserializeFunctionDefinitions(records, visualRecords = []){
    USER_FUNCTION_DEFINITIONS.clear();
    if(records === undefined) return;
    if(!Array.isArray(records)) throw new Error("Program file contains invalid function definitions.");
    const visualsById = new Map((Array.isArray(visualRecords) ? visualRecords : []).map(record => [record.id, record]));
    for(const record of records){
        if(typeof record?.id !== "string" || USER_FUNCTION_DEFINITIONS.has(record.id) ||
           typeof record.name !== "string" || !Array.isArray(record.ports)){
            throw new Error("Program file contains an invalid function definition.");
        }
        const visual = visualsById.get(record.id);
        if(!visual?.bounds || ![visual.bounds.left, visual.bounds.right, visual.bounds.top, visual.bounds.bottom].every(Number.isFinite)){
            throw new Error("Program file contains invalid function frame visuals.");
        }
        USER_FUNCTION_DEFINITIONS.set(record.id, new FunctionDefinition(record.id, record.name, [], [], visual.bounds, visual));
    }
    for(const record of records){
        const definition = USER_FUNCTION_DEFINITIONS.get(record.id);
        definition.ports = record.ports.map(port => {
            const type = port.type === "control" ? ControlType :
                port.type === "type-variable" ? new TypeVariable(port.typeVariableName || "T") :
                {number: NumberType, string: StringType, bool: BoolType}[port.type];
            if(!type || typeof port.id !== "string" || !["input", "output"].includes(port.direction)){
                throw new Error("Program file contains an invalid function port.");
            }
            return {id: port.id, name: typeof port.name === "string" ? port.name : "", direction: port.direction, type,
                typeVariableName: type instanceof TypeVariable ? type.name : null};
        });
    }
    for(const record of records){
        const definition = USER_FUNCTION_DEFINITIONS.get(record.id);
        const model = deserializeModel(record.model, {requireStart: false});
        definition.nodes = model.nodes;
        if(!definition.visuals || !Array.isArray(definition.visuals.nodes) || definition.visuals.nodes.length !== model.nodes.length){
            throw new Error("Program file contains invalid function visuals.");
        }
    }
}

