
class NumberType{}
class StringType{}
class BoolType{}
class ControlType{}

const DIRECTIONS = {OUTPUT: "OUTPUT", INPUT: "INPUT"};

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
    AddNode,
    EqualityNode,
    NumberToStringNode,
    PrintNode,
    SplitNode
];

