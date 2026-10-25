
class NumberType{}
class StringType{}
class BoolType{}
class ControlType{}

const DIRECTIONS = {OUTPUT: "OUTPUT", INPUT: "INPUT"};

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
        if(slot.type !== this.type){
            const sourceType = this.type.name.replace(/Type$/, "").toLowerCase();
            const targetType = slot.type.name.replace(/Type$/, "").toLowerCase();
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
            connectedSlot.node.execute();
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
            connectedSlot.node.execute();
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
                connectedSlot.node.execute();
            }
        } else {
            for(let connectedSlot of [...this.falseOutputSlot.connectedSlots]){
                connectedSlot.node.execute();
            }
        }
    }
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
            connectedSlot.node.execute();
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
    SplitNode
];

function serializeModel(nodes){
    const nodeIds = new Map(nodes.map((node, id) => [node, id]));
    const serializedNodes = nodes.map((node, id) => {
        const record = {id, type: node.constructor.name};
        if(node instanceof NumberNode || node instanceof StringNode){
            record.value = node.valueSlot.value;
        }
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

function deserializeModel(modelData){
    if(modelData?.version !== 1 || !Array.isArray(modelData.nodes) ||
       !Array.isArray(modelData.connections)){
        throw new Error("Program file contains invalid model data.");
    }
    const constructors = new Map([...NODE_TYPES, StartNode].map(NodeType => [NodeType.name, NodeType]));
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
        } else {
            node = new NodeType();
        }
        nodesById.set(id, node);
        nodeIdsByNode.set(node, id);
        return node;
    });
    if(nodes.filter(node => node instanceof StartNode).length !== 1){
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
           inputSlot.direction !== DIRECTIONS.INPUT || outputSlot.type !== inputSlot.type){
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

