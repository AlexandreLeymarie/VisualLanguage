
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



let a = new NumberNode(2);
let b = new NumberNode(3);
let sum = new AddNode();
sum.aSlot.connect(a.valueSlot);
sum.bSlot.connect(b.valueSlot);
let str = new NumberToStringNode();
str.inputSlot.connect(sum.sumSlot);
let printNode = new PrintNode();
printNode.valueSlot.connect(str.outputSlot);
let double = new AddNode();
double.aSlot.connect(sum.sumSlot);
double.bSlot.connect(sum.sumSlot);
let doubleStr = new NumberToStringNode();
doubleStr.inputSlot.connect(double.sumSlot);
let printNode2 = new PrintNode();
printNode2.valueSlot.connect(doubleStr.outputSlot);
//printNode.controlOutputSlot.connect(printNode2.controlInputSlot);
//printNode.execute();
let equalityNode = new EqualityNode();
equalityNode.aSlot.connect(a.valueSlot);
equalityNode.bSlot.connect(b.valueSlot);
//console.log(equalityNode.equalSlot.getValue());
let startSplit = new SplitNode();
startSplit.conditionSlot.connect(equalityNode.outputSlot);
startSplit.trueOutputSlot.connect(printNode.controlInputSlot);
startSplit.falseOutputSlot.connect(printNode2.controlInputSlot);
startSplit.execute();


const cv = document.getElementById("canvas");
const ctx = cv.getContext("2d");
cv.width = 800;
cv.height = 600;

let worldToCanvas=(p,cam)=>p.sub(cam.pos).mul(cam.zoom).add(vec(cv.width/2,cv.height/2))
let canvasToWorld=(p,cam)=>p.sub(vec(cv.width/2,cv.height/2)).mul(1/cam.zoom).add(cam.pos)


class Space{
    constructor(){
        this.cam = {pos: vec(0, 0), zoom: 1};
        this.nodes = [a, b, str, printNode, printNode2, equalityNode, startSplit];
        this.nodeVisuals = [];
        for(let node of this.nodes){
            this.nodeVisuals.push(new NodeVisual(node, vec(Math.random()*800-400, Math.random()*500-250)));
        }
    }
    draw(){
        ctx.fillStyle = "rgba(20, 20, 30)";
        ctx.fillRect(0, 0, cv.width, cv.height);
        for(let nodeVisual of this.nodeVisuals){
            nodeVisual.draw(this.cam);
        }
    }
}
const cam = {}
class NodeVisual{
    constructor(node, pos){
        this.node = node;
        this.pos = pos;
        this.size = vec(64, 64);
        this.sloteVisuals = [];
        let a = -Math.PI*2/3;
        for(let slot of this.node.slots){
            this.sloteVisuals.push(new SlotVisual(slot, this, a));
            a += 1;
        }
    }
    draw(cam){
        let cornerSp = worldToCanvas(this.pos.sub(this.size.mul(.5)), cam);
        let centerSp = worldToCanvas(this.pos, cam);
        ctx.beginPath();
        ctx.roundRect(cornerSp.x, cornerSp.y, this.size.x*cam.zoom, this.size.y*cam.zoom, cam.zoom*10);
        ctx.fillStyle = "rgba(20, 20, 60, 1)";
        ctx.fill();
        ctx.strokeStyle = "white";
        ctx.lineWidth = cam.zoom*2;
        ctx.stroke();
        ctx.fillStyle = "white";
        ctx.font = (cam.zoom*16)+"px Helvetica";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle"
        ctx.fillText(this.node.name, centerSp.x, centerSp.y, (this.size.x-4)*cam.zoom);
        for(let slotVisual of this.sloteVisuals){
            slotVisual.draw(cam);
        }
    }
}

function getRectEdgePosition(size, angle) {
    let w = size.x;
    let h = size.y;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    const scaleX = Math.abs(dx) < 1e-10 ? Infinity : (w / 2) / Math.abs(dx);
    const scaleY = Math.abs(dy) < 1e-10 ? Infinity : (h / 2) / Math.abs(dy);

    const scale = Math.min(scaleX, scaleY);

    return new Vector(dx * scale, dy * scale);
}

class SlotVisual{
    constructor(slot, nodeVisual, angle){
        this.slot = slot;
        this.nodeVisual = nodeVisual;
        this.angle = angle;
        this.radius = 5;
    }
    draw(cam){
        let shift = getRectEdgePosition(this.nodeVisual.size.add(vec(this.radius*2+4)), this.angle);
        let pos = this.nodeVisual.pos.add(shift);
        let sp = worldToCanvas(pos, cam);
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, cam.zoom*this.radius, 0, Math.PI*2);
        ctx.fillStyle = "white";
        ctx.fill();
        ctx.fillStyle = "rgba(255, 255, 255, .4)";
        let textSideSign = shift.x < 0 ? -1 : 1;
        ctx.textAlign = shift.x < 0 ? "right" : "left";
        ctx.fillText(this.slot.name, sp.x+this.radius*textSideSign, sp.y);
    }
}

const space = new Space();
space.draw();


// class ControlNode extends Node{
//     constructor(){
//         this.inputControlSlot = null;
//         this.outputControlSlots = [];
//     }
//     execute(){

//     }
//     executeAndPassFlow(){
//         this.execute();
//         for(let slot of this.outputControlSlots){
//             if()
//         }
//     }
// }
