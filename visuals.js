const BACKGROUND_COL = "#0B1020";
const NODE_BACKGROUND_COL = "#17243A";
const STROKE_COL = "#526783";
const SLOT_TEXT_COL = "#A9B9D0";
const NODE_TEXT_COL = "#F1F5F9";

const cv = document.getElementById("canvas");
const ctx = cv.getContext("2d");
cv.width = 800;
cv.height = 600;

let worldToCanvas=(p,cam)=>p.sub(cam.pos).mul(cam.zoom).add(vec(cv.width/2,cv.height/2))
let canvasToWorld=(p,cam)=>p.sub(vec(cv.width/2,cv.height/2)).mul(1/cam.zoom).add(cam.pos)


class Space{
    constructor(nodes){
        this.cam = {pos: vec(0, 0), zoom: 1};
        this.nodes = nodes;
        this.nodeVisuals = [];
        this.slotVisuals = new Map();
        for(let node of this.nodes){
            this.nodeVisuals.push(new NodeVisual(node, vec(Math.random()*800-400, Math.random()*500-250), this));
        }
    }
    draw(){
        ctx.fillStyle = BACKGROUND_COL;
        ctx.fillRect(0, 0, cv.width, cv.height);
        for(let slotVisual of this.slotVisuals.values()){
            slotVisual.drawConnections(this.cam);
        }
        for(let nodeVisual of this.nodeVisuals){
            nodeVisual.draw(this.cam);
        }
    }
}
const cam = {}
class NodeVisual{
    constructor(node, pos, space){
        this.node = node;
        this.pos = pos;
        this.size = vec(64, 64);
        this.sloteVisuals = [];
        let a = -Math.PI*2/3;
        for(let slot of this.node.slots){
            const slotVisual = new SlotVisual(slot, this, a, space);
            this.sloteVisuals.push(slotVisual);
            space.slotVisuals.set(slot, slotVisual);
            a += 1;
        }
    }
    draw(cam){
        let cornerSp = worldToCanvas(this.pos.sub(this.size.mul(.5)), cam);
        let centerSp = worldToCanvas(this.pos, cam);
        ctx.beginPath();
        ctx.roundRect(cornerSp.x, cornerSp.y, this.size.x*cam.zoom, this.size.y*cam.zoom, cam.zoom*10);
        ctx.fillStyle = NODE_BACKGROUND_COL;
        ctx.fill();
        ctx.strokeStyle = STROKE_COL;
        ctx.lineWidth = cam.zoom*2;
        ctx.stroke();
        ctx.fillStyle = NODE_TEXT_COL;
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
    constructor(slot, nodeVisual, angle, space){
        this.slot = slot;
        this.nodeVisual = nodeVisual;
        this.angle = angle;
        this.radius = 5;
        this.space = space;
    }
    getPosition(){
        let shift = getRectEdgePosition(this.nodeVisual.size.add(vec(this.radius*2+4)), this.angle);
        return this.nodeVisual.pos.add(shift);
    }
    drawConnections(cam){
        if(this.slot.direction !== DIRECTIONS.INPUT) return;
        const start = worldToCanvas(this.getPosition(), cam);
        for(let connectedSlot of this.slot.connectedSlots){
            const connectedVisual = this.space.slotVisuals.get(connectedSlot);
            if(connectedVisual === undefined) continue;
            const end = worldToCanvas(connectedVisual.getPosition(), cam);
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.strokeStyle = STROKE_COL;
            ctx.lineWidth = cam.zoom*2;
            ctx.stroke();
        }
    }
    draw(cam){
        let shift = getRectEdgePosition(this.nodeVisual.size.add(vec(this.radius*2+4)), this.angle);
        let pos = this.nodeVisual.pos.add(shift);
        let sp = worldToCanvas(pos, cam);
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, cam.zoom*this.radius, 0, Math.PI*2);
        ctx.fillStyle = STROKE_COL;
        ctx.fill();
        ctx.fillStyle = SLOT_TEXT_COL;
        let textSideSign = shift.x < 0 ? -1 : 1;
        ctx.textAlign = shift.x < 0 ? "right" : "left";
        ctx.fillText(this.slot.name, sp.x+this.radius*textSideSign, sp.y);
    }
}
