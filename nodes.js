
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
        
        this.connectedSlot = null;
    }
    connect(slot){
        this.connectedSlot = slot; // ahhh connect should connect both ways! But also, some slots can have multiple connections!!
    }
    disconnect(){
        this.connectedSlot = null;
    }
    canConnectToSlot(slot){
        return slot.direction !== this.direction && slot.type === this.type;
    }
    getValue(){
        if(this.direction == DIRECTIONS.INPUT){
            if(this.connectedSlot !== null) return this.connectedSlot.getValue();
            return null;
        } else {
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
}

class NumberNode extends Node{
    constructor(value){
        super();
        this.name = String(value);
        this.valueSlot = new Slot(this, NumberType, DIRECTIONS.OUTPUT, "value");
        this.valueSlot.value = value;
        this.slots = [this.valueSlot];
    }
}

class AddNode extends Node{
    constructor(){
        super();
        this.name = "+";
        this.aSlot = new Slot(this, NumberType, DIRECTIONS.INPUT, "A");
        this.bSlot = new Slot(this, NumberType, DIRECTIONS.INPUT, "B");
        this.sumSlot = new Slot(this, NumberType, DIRECTIONS.OUTPUT, "sum");
        this.sumSlot.getValue = this.getSum.bind(this);

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

    getSum(){
        this.computeData();
        return this.sumSlot.value;
    }
}

class EqualityNode extends Node{
    constructor(){
        super();
        this.name = "=";
        this.aSlot = new Slot(this, NumberType, DIRECTIONS.INPUT, "A");
        this.bSlot = new Slot(this, NumberType, DIRECTIONS.INPUT, "B");
        this.outputSlot = new Slot(this, BoolType, DIRECTIONS.OUTPUT, "equal?");
        this.outputSlot.getValue = this.getAreEqual.bind(this);

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

    getAreEqual(){
        this.computeData();
        return this.outputSlot.value;
    }
}

class NumberToStringNode extends Node{
    constructor(){
        super();
        this.name = "to string";
        this.inputSlot = new Slot(this, NumberType, DIRECTIONS.INPUT, "number");
        this.outputSlot = new Slot(this, StringType, DIRECTIONS.OUTPUT, "string");
        this.outputSlot.getValue = this.getString.bind(this);
        this.slots = [this.inputSlot, this.outputSlot];
    }
    computeData(){
        let n = this.inputSlot.getValue();
        if(n === null) return;
        this.outputSlot.value = String(n);
    }
    getString(){
        this.computeData();
        return this.outputSlot.value;
    }
}

class PrintNode extends Node{
    constructor(){
        super();
        this.name = "print";
        this.valueSlot = new Slot(this, StringType, DIRECTIONS.INPUT, "string");
        this.controlInputSlot = new Slot(this, ControlType, DIRECTIONS.INPUT, "controlInput");
        this.controlOutputSlot = new Slot(this, ControlType, DIRECTIONS.OUTPUT, "controlOutput");
        this.slots = [this.valueSlot, this.controlInputSlot, this.controlOutputSlot];
    }
    execute(){
        let value = this.valueSlot.getValue();
        if(value === null) return;
        console.log(value);
        if(this.controlOutputSlot.connectedSlot !== null){
            this.controlOutputSlot.connectedSlot.node.execute();
        }
    }
}

class SplitNode extends Node{
    constructor(){
        super();
        this.name = "split"
        this.conditionSlot = new Slot(this, StringType, DIRECTIONS.INPUT, "condition");
        this.controlInputSlot = new Slot(this, ControlType, DIRECTIONS.INPUT, "controlInput");
        this.trueOutputSlot = new Slot(this, ControlType, DIRECTIONS.OUTPUT, "true");
        this.falseOutputSlot = new Slot(this, ControlType, DIRECTIONS.OUTPUT, "false");
        this.slots = [this.conditionSlot, this.controlInputSlot, this.trueOutputSlot, this.falseOutputSlot];
    }
    execute(){
        let value = this.conditionSlot.getValue();
        if(value === null) return;
        if(value){
            if(this.trueOutputSlot.connectedSlot !== null) this.trueOutputSlot.connectedSlot.node.execute();
        } else {
            if(this.falseOutputSlot.connectedSlot !== null) this.falseOutputSlot.connectedSlot.node.execute();
        }
    }
}

