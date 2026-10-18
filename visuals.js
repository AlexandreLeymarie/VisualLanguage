const BACKGROUND_COL = "#0B1020";
const NODE_BACKGROUND_COL = "#17243A";
const STROKE_COL = "#526783";
const SLOT_TEXT_COL = "#A9B9D0";
const NODE_TEXT_COL = "#F1F5F9";

const cv = document.getElementById("canvas");
const ctx = cv.getContext("2d");
cv.width = 800;
cv.height = 600;

function resizeCanvas(){
    const rect = cv.getBoundingClientRect();
    cv.width = Math.max(1, Math.round(rect.width));
    cv.height = Math.max(1, Math.round(rect.height));
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

let worldToCanvas=(p,cam)=>p.sub(cam.pos).mul(cam.zoom).add(vec(cv.width/2,cv.height/2))
let canvasToWorld=(p,cam)=>p.sub(vec(cv.width/2,cv.height/2)).mul(1/cam.zoom).add(cam.pos)
const NODE_PICKER = {x: 16, y: 16, buttonWidth: 132, buttonHeight: 48, menuY: 76, menuWidth: 190, rowHeight: 32};


class Space{
    constructor(nodes){
        this.cam = {pos: vec(0, 0), zoom: 1};
        this.nodes = nodes;
        this.nodeVisuals = [];
        this.slotVisuals = new Map();
        for(let node of this.nodes){
            this.nodeVisuals.push(new NodeVisual(node, vec(Math.random()*800-400, Math.random()*500-250), this));
        }
        this.draggedNodeVisual = null;
        this.draggedSlotVisual = null;
        this.dragOffset = vec();
        this.nodePickerOpen = false;
        this.hoveredPickerItem = null;
        this.nodeTypes = NODE_TYPES.map(NodeType => ({
            NodeType,
            name: NodeType.displayName || new NodeType().name
        }));
        cv.addEventListener("pointerdown", this.onPointerDown.bind(this));
        cv.addEventListener("pointermove", this.onPointerMove.bind(this));
        cv.addEventListener("pointerup", this.onPointerUp.bind(this));
        cv.addEventListener("pointercancel", this.onPointerUp.bind(this));
        cv.addEventListener("pointerleave", () => {
            this.hoveredPickerItem = null;
            if(this.draggedNodeVisual === null && this.draggedSlotVisual === null) cv.style.cursor = "";
        });
    }
    addNode(type){
        let node;
        if(type.NodeType === NumberNode){
            const rawValue = window.prompt("Enter a number:");
            if(rawValue === null || rawValue.trim() === "") return;
            const value = Number(rawValue);
            if(!Number.isFinite(value)){
                window.alert("Please enter a valid finite number.");
                return;
            }
            node = new NumberNode(value);
        } else {
            node = new type.NodeType();
        }
        if(node === null) return;
        this.nodes.push(node);
        this.nodeVisuals.push(new NodeVisual(node, this.cam.pos.copy(), this));
    }
    drawNodePicker(){
        const {x, y, buttonWidth, buttonHeight, menuY, menuWidth, rowHeight} = NODE_PICKER;
        ctx.beginPath();
        ctx.roundRect(x, y, buttonWidth, buttonHeight, 8);
        ctx.fillStyle = this.hoveredPickerItem === "button" ? "#293D59" : NODE_BACKGROUND_COL;
        ctx.fill();
        ctx.strokeStyle = STROKE_COL;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.strokeStyle = NODE_TEXT_COL;
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        if(this.nodePickerOpen){
            ctx.moveTo(x + 15, y + buttonHeight/2 - 5);
            ctx.lineTo(x + 25, y + buttonHeight/2 + 5);
            ctx.moveTo(x + 25, y + buttonHeight/2 - 5);
            ctx.lineTo(x + 15, y + buttonHeight/2 + 5);
        } else {
            ctx.moveTo(x + 20, y + buttonHeight/2 - 6);
            ctx.lineTo(x + 20, y + buttonHeight/2 + 6);
            ctx.moveTo(x + 14, y + buttonHeight/2);
            ctx.lineTo(x + 26, y + buttonHeight/2);
        }
        ctx.stroke();
        ctx.fillStyle = NODE_TEXT_COL;
        ctx.font = "16px Helvetica";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText("Add node", x + 38, y + buttonHeight/2);
        if(!this.nodePickerOpen) return;

        const menuHeight = this.nodeTypes.length * rowHeight + 12;
        ctx.beginPath();
        ctx.roundRect(x, menuY, menuWidth, menuHeight, 8);
        ctx.fillStyle = NODE_BACKGROUND_COL;
        ctx.fill();
        ctx.strokeStyle = STROKE_COL;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.font = "14px Helvetica";
        ctx.textAlign = "left";
        for(let i = 0; i < this.nodeTypes.length; i++){
            const rowTop = menuY + 6 + i * rowHeight;
            if(this.hoveredPickerItem === i){
                ctx.fillStyle = "#293D59";
                ctx.fillRect(x + 6, rowTop, menuWidth - 12, rowHeight);
            }
            ctx.fillStyle = SLOT_TEXT_COL;
            ctx.fillText(this.nodeTypes[i].name, x + 12, rowTop + rowHeight/2);
        }
    }
    getPickerItemAt(position){
        const {x, y, buttonWidth, buttonHeight, menuY, menuWidth, rowHeight} = NODE_PICKER;
        if(position.x >= x && position.x <= x + buttonWidth &&
           position.y >= y && position.y <= y + buttonHeight) return "button";
        if(!this.nodePickerOpen || position.x < x || position.x > x + menuWidth ||
           position.y < menuY + 6 || position.y >= menuY + 6 + this.nodeTypes.length * rowHeight) return null;
        return Math.floor((position.y - menuY - 6) / rowHeight);
    }
    getWorldPointerPosition(event){
        const rect = cv.getBoundingClientRect();
        const canvasPosition = vec(
            (event.clientX - rect.left) * cv.width / rect.width,
            (event.clientY - rect.top) * cv.height / rect.height
        );
        return canvasToWorld(canvasPosition, this.cam);
    }
    onPointerDown(event){
        const rect = cv.getBoundingClientRect();
        const screenPosition = vec(
            (event.clientX - rect.left) * cv.width / rect.width,
            (event.clientY - rect.top) * cv.height / rect.height
        );
        const {x, y, buttonWidth, buttonHeight, menuY, menuWidth, rowHeight} = NODE_PICKER;
        if(screenPosition.x >= x && screenPosition.x <= x + buttonWidth &&
           screenPosition.y >= y && screenPosition.y <= y + buttonHeight){
            this.nodePickerOpen = !this.nodePickerOpen;
            event.preventDefault();
            return;
        }
        if(this.nodePickerOpen){
            const menuHeight = this.nodeTypes.length * rowHeight + 12;
            if(screenPosition.x >= x && screenPosition.x <= x + menuWidth &&
               screenPosition.y >= menuY + 6 && screenPosition.y < menuY + menuHeight - 6){
                const index = Math.floor((screenPosition.y - menuY - 6) / rowHeight);
                const selectedType = this.nodeTypes[index];
                this.nodePickerOpen = false;
                if(selectedType) this.addNode(selectedType);
                event.preventDefault();
                return;
            }
            this.nodePickerOpen = false;
        }
        const pointerPosition = this.getWorldPointerPosition(event);
        for(let i = this.nodeVisuals.length - 1; i >= 0; i--){
            const nodeVisual = this.nodeVisuals[i];
            for(let j = nodeVisual.sloteVisuals.length - 1; j >= 0; j--){
                const slotVisual = nodeVisual.sloteVisuals[j];
                if(pointerPosition.sub(slotVisual.getPosition()).length() <= slotVisual.radius + 3 / this.cam.zoom){
                    this.draggedSlotVisual = slotVisual;
                    cv.setPointerCapture(event.pointerId);
                    cv.style.cursor = "grabbing";
                    event.preventDefault();
                    return;
                }
            }
            const halfSize = nodeVisual.size.mul(.5);
            if(Math.abs(pointerPosition.x - nodeVisual.pos.x) <= halfSize.x &&
               Math.abs(pointerPosition.y - nodeVisual.pos.y) <= halfSize.y){
                this.draggedNodeVisual = nodeVisual;
                this.dragOffset = nodeVisual.pos.sub(pointerPosition);
                cv.setPointerCapture(event.pointerId);
                cv.style.cursor = "grabbing";
                event.preventDefault();
                return;
            }
        }
    }
    onPointerMove(event){
        const rect = cv.getBoundingClientRect();
        const screenPosition = vec(
            (event.clientX - rect.left) * cv.width / rect.width,
            (event.clientY - rect.top) * cv.height / rect.height
        );
        this.hoveredPickerItem = this.getPickerItemAt(screenPosition);
        if(this.draggedSlotVisual !== null){
            const pointerPosition = this.getWorldPointerPosition(event);
            const nodePosition = this.draggedSlotVisual.nodeVisual.pos;
            this.draggedSlotVisual.angle = Math.atan2(
                pointerPosition.y - nodePosition.y,
                pointerPosition.x - nodePosition.x
            );
            return;
        }
        if(this.draggedNodeVisual !== null){
            this.draggedNodeVisual.pos = this.getWorldPointerPosition(event).add(this.dragOffset);
            return;
        }
        if(this.hoveredPickerItem !== null){
            cv.style.cursor = "pointer";
            return;
        }

        const pointerPosition = this.getWorldPointerPosition(event);
        let isOverDraggable = false;
        for(let i = this.nodeVisuals.length - 1; i >= 0 && !isOverDraggable; i--){
            const nodeVisual = this.nodeVisuals[i];
            for(let j = nodeVisual.sloteVisuals.length - 1; j >= 0; j--){
                const slotVisual = nodeVisual.sloteVisuals[j];
                if(pointerPosition.sub(slotVisual.getPosition()).length() <= slotVisual.radius + 3 / this.cam.zoom){
                    isOverDraggable = true;
                    break;
                }
            }
            const halfSize = nodeVisual.size.mul(.5);
            if(Math.abs(pointerPosition.x - nodeVisual.pos.x) <= halfSize.x &&
               Math.abs(pointerPosition.y - nodeVisual.pos.y) <= halfSize.y){
                isOverDraggable = true;
            }
        }
        cv.style.cursor = isOverDraggable ? "grab" : "";
    }
    onPointerUp(event){
        if(this.draggedNodeVisual === null && this.draggedSlotVisual === null) return;
        this.draggedNodeVisual = null;
        this.draggedSlotVisual = null;
        if(cv.hasPointerCapture(event.pointerId)) cv.releasePointerCapture(event.pointerId);
        cv.style.cursor = "";
        this.onPointerMove(event);
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
        this.drawNodePicker();
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

function getRectEdgePosition(size, angle, radius = 10) {
    const halfWidth = size.x / 2;
    const halfHeight = size.y / 2;
    const cornerRadius = Math.max(0, Math.min(radius, halfWidth, halfHeight));
    const dx = Math.abs(Math.cos(angle));
    const dy = Math.abs(Math.sin(angle));
    const signX = Math.cos(angle) < 0 ? -1 : 1;
    const signY = Math.sin(angle) < 0 ? -1 : 1;
    let distance = Infinity;

    if(dx > 1e-10){
        const sideDistance = halfWidth / dx;
        if(sideDistance * dy <= halfHeight - cornerRadius){
            distance = Math.min(distance, sideDistance);
        }
    }
    if(dy > 1e-10){
        const sideDistance = halfHeight / dy;
        if(sideDistance * dx <= halfWidth - cornerRadius){
            distance = Math.min(distance, sideDistance);
        }
    }

    if(!Number.isFinite(distance)){
        const cornerX = halfWidth - cornerRadius;
        const cornerY = halfHeight - cornerRadius;
        const projection = cornerX * dx + cornerY * dy;
        const discriminant = projection * projection - (cornerX * cornerX + cornerY * cornerY - cornerRadius * cornerRadius);
        distance = projection + Math.sqrt(Math.max(0, discriminant));
    }

    return new Vector(signX * dx * distance, signY * dy * distance);
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
        const offset = this.radius + 2;
        let shift = getRectEdgePosition(
            this.nodeVisual.size.add(vec(offset*2)),
            this.angle,
            10 + offset
        );
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
        let pos = this.getPosition();
        let shift = pos.sub(this.nodeVisual.pos);
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
