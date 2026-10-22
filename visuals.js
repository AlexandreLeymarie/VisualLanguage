const BACKGROUND_COL = "#0B1020";
const NODE_BACKGROUND_COL = "#17243A";
const STROKE_COL = "#526783";
const SLOT_TEXT_COL = "#A9B9D0";
const NODE_TEXT_COL = "#F1F5F9";
const SLOT_DRAG_PADDING = 3;
const SLOT_ANGLE_PADDING = 0;
const SLOT_HOVER_PADDING = 18;
const MINIMAP = {x: 16, width: 200, height: 120, margin: 16};

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
const NODE_PICKER = {x: 16, y: 16, buttonWidth: 48, buttonHeight: 48, eraserX: 72, executeX: 128, executeWidth: 120, menuY: 76, menuWidth: 190, rowHeight: 32};


class Space{
    constructor(nodes){
        this.cam = {pos: vec(0, 0), zoom: 1};
        this.nodes = nodes;
        this.startNode = this.nodes.find(node => node instanceof StartNode) || null;
        this.nodeVisuals = [];
        this.slotVisuals = new Map();
        for(let node of this.nodes){
            const position = node instanceof StartNode
                ? this.cam.pos.copy()
                : vec(Math.random()*800-400, Math.random()*500-250);
            this.nodeVisuals.push(new NodeVisual(node, position, this));
        }
        this.draggedNodeVisual = null;
        this.draggedSlotVisual = null;
        this.connectingSlotVisual = null;
        this.isPanning = false;
        this.lastPanPosition = null;
        this.hoveredSlotVisual = null;
        this.hoveredSlotCanDragAngle = false;
        this.hoveredConnectionIsLegal = false;
        this.eraserMode = false;
        this.hoveredEraseTarget = null;
        this.pointerWorldPosition = null;
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
        cv.addEventListener("wheel", this.onWheel.bind(this), {passive: false});
        cv.addEventListener("pointerleave", () => {
            this.hoveredPickerItem = null;
            this.hoveredEraseTarget = null;
            if(this.draggedNodeVisual === null && this.draggedSlotVisual === null && this.connectingSlotVisual === null && !this.isPanning){
                this.hoveredSlotVisual = null;
                this.hoveredSlotCanDragAngle = false;
                cv.style.cursor = "";
            }
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
        const {x, y, buttonWidth, buttonHeight, eraserX, executeX, executeWidth, menuY, menuWidth, rowHeight} = NODE_PICKER;
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        ctx.lineCap = "butt";
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
            ctx.moveTo(x + 19, y + buttonHeight/2 - 5);
            ctx.lineTo(x + 29, y + buttonHeight/2 + 5);
            ctx.moveTo(x + 29, y + buttonHeight/2 - 5);
            ctx.lineTo(x + 19, y + buttonHeight/2 + 5);
        } else {
            ctx.moveTo(x + 24, y + buttonHeight/2 - 6);
            ctx.lineTo(x + 24, y + buttonHeight/2 + 6);
            ctx.moveTo(x + 18, y + buttonHeight/2);
            ctx.lineTo(x + 30, y + buttonHeight/2);
        }
        ctx.stroke();
        ctx.beginPath();
        ctx.roundRect(eraserX, y, buttonWidth, buttonHeight, 8);
        ctx.fillStyle = this.eraserMode ? "#5B2D2D" : this.hoveredPickerItem === "eraser" ? "#293D59" : NODE_BACKGROUND_COL;
        ctx.fill();
        ctx.strokeStyle = this.eraserMode ? "#EF7777" : STROKE_COL;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = NODE_TEXT_COL;
        ctx.font = "30px Helvetica";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("−", eraserX + buttonWidth/2, y + buttonHeight/2 - 1);
        ctx.beginPath();
        ctx.roundRect(executeX, y, executeWidth, buttonHeight, 8);
        ctx.fillStyle = this.hoveredPickerItem === "execute" ? "#293D59" : NODE_BACKGROUND_COL;
        ctx.fill();
        ctx.strokeStyle = STROKE_COL;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = NODE_TEXT_COL;
        ctx.beginPath();
        ctx.moveTo(executeX + 14, y + buttonHeight/2 - 7);
        ctx.lineTo(executeX + 14, y + buttonHeight/2 + 7);
        ctx.lineTo(executeX + 25, y + buttonHeight/2);
        ctx.closePath();
        ctx.fill();
        ctx.font = "16px Helvetica";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText("Execute", executeX + 34, y + buttonHeight/2);
        if(!this.nodePickerOpen){
            ctx.restore();
            return;
        }

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
        ctx.restore();
    }
    getPickerItemAt(position){
        const {x, y, buttonWidth, buttonHeight, eraserX, executeX, executeWidth, menuY, menuWidth, rowHeight} = NODE_PICKER;
        if(position.x >= eraserX && position.x <= eraserX + buttonWidth &&
           position.y >= y && position.y <= y + buttonHeight) return "eraser";
        if(position.x >= executeX && position.x <= executeX + executeWidth &&
           position.y >= y && position.y <= y + buttonHeight) return "execute";
        if(position.x >= x && position.x <= x + buttonWidth &&
           position.y >= y && position.y <= y + buttonHeight) return "button";
        if(!this.nodePickerOpen || position.x < x || position.x > x + menuWidth ||
           position.y < menuY + 6 || position.y >= menuY + 6 + this.nodeTypes.length * rowHeight) return null;
        return Math.floor((position.y - menuY - 6) / rowHeight);
    }
    getSlotVisualAt(position, extraRadius = 0, sourceSlotVisual = null, filterLegal = true){
        let closest = null;
        let closestDistance = Infinity;
        for(let i = this.nodeVisuals.length - 1; i >= 0; i--){
            const nodeVisual = this.nodeVisuals[i];
            for(let j = nodeVisual.sloteVisuals.length - 1; j >= 0; j--){
                const slotVisual = nodeVisual.sloteVisuals[j];
                if(slotVisual === sourceSlotVisual) continue;
                if(filterLegal && sourceSlotVisual && !sourceSlotVisual.slot.canConnectToSlot(slotVisual.slot)) continue;
                const distance = position.sub(slotVisual.getPosition()).length();
                if(distance <= slotVisual.radius + extraRadius && distance < closestDistance){
                    closest = slotVisual;
                    closestDistance = distance;
                }
            }
        }
        return closest;
    }
    isPointOverNode(position, nodeVisual){
        const local = position.sub(nodeVisual.pos);
        const halfWidth = nodeVisual.size.x / 2;
        const halfHeight = nodeVisual.size.y / 2;
        const radius = 10;
        const x = Math.abs(local.x);
        const y = Math.abs(local.y);
        if(x > halfWidth || y > halfHeight) return false;
        if(x <= halfWidth - radius || y <= halfHeight - radius) return true;
        const cornerX = x - (halfWidth - radius);
        const cornerY = y - (halfHeight - radius);
        return cornerX * cornerX + cornerY * cornerY <= radius * radius;
    }
    getNodeVisualAt(position){
        for(let i = this.nodeVisuals.length - 1; i >= 0; i--){
            if(this.isPointOverNode(position, this.nodeVisuals[i])) return this.nodeVisuals[i];
        }
        return null;
    }
    isPointerOverNode(position){
        return this.getNodeVisualAt(position) !== null;
    }
    getEraseTargetAt(position){
        const nodeVisual = this.getNodeVisualAt(position);
        if(nodeVisual !== null && nodeVisual.node !== this.startNode) return {nodeVisual};

        let closestTarget = null;
        let closestDistance = Infinity;
        const maxDistance = 8 / this.cam.zoom;
        for(const candidateVisual of this.nodeVisuals){
            for(const inputSlot of candidateVisual.node.getInputSlots()){
                const inputVisual = this.slotVisuals.get(inputSlot);
                if(inputVisual === undefined) continue;
                for(const outputSlot of inputSlot.connectedSlots){
                    const outputVisual = this.slotVisuals.get(outputSlot);
                    if(outputVisual === undefined) continue;
                    const start = inputVisual.getConnectionPosition();
                    const end = outputVisual.getConnectionPosition();
                    const segment = end.sub(start);
                    const lengthSquared = segment.dot(segment);
                    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, position.sub(start).dot(segment) / lengthSquared));
                    const nearest = start.add(segment.mul(t));
                    const distance = position.sub(nearest).length();
                    if(distance <= maxDistance && distance < closestDistance){
                        closestTarget = {inputSlot, outputSlot};
                        closestDistance = distance;
                    }
                }
            }
        }
        return closestTarget;
    }
    eraseAt(position){
        const target = this.getEraseTargetAt(position);
        if(target === null) return;
        if(target.nodeVisual){
            const node = target.nodeVisual.node;
            for(const slot of node.slots) slot.disconnect();
            for(const slot of node.slots) this.slotVisuals.delete(slot);
            this.nodes = this.nodes.filter(existing => existing !== node);
            this.nodeVisuals = this.nodeVisuals.filter(visual => visual !== target.nodeVisual);
            if(node === this.startNode) this.startNode = null;
            this.hoveredEraseTarget = null;
        } else {
            target.inputSlot.disconnect(target.outputSlot);
        }
    }
    getWorldPointerPosition(event){
        return canvasToWorld(this.getCanvasPointerPosition(event), this.cam);
    }
    getCanvasPointerPosition(event){
        const rect = cv.getBoundingClientRect();
        return vec(
            (event.clientX - rect.left) * cv.width / rect.width,
            (event.clientY - rect.top) * cv.height / rect.height
        );
    }
    isPointerOverMinimap(position){
        const y = cv.height - MINIMAP.height - MINIMAP.margin;
        return position.x >= MINIMAP.x && position.x <= MINIMAP.x + MINIMAP.width &&
            position.y >= y && position.y <= y + MINIMAP.height;
    }
    onWheel(event){
        event.preventDefault();
        const pointerPosition = this.getCanvasPointerPosition(event);
        const worldPosition = canvasToWorld(pointerPosition, this.cam);
        const zoomFactor = Math.exp(-event.deltaY * 0.001);
        this.cam.zoom = Math.max(0.2, Math.min(4, this.cam.zoom * zoomFactor));
        this.cam.pos = worldPosition.sub(
            pointerPosition.sub(vec(cv.width/2, cv.height/2)).mul(1 / this.cam.zoom)
        );
        this.pointerWorldPosition = this.getWorldPointerPosition(event);
    }
    onPointerDown(event){
        const rect = cv.getBoundingClientRect();
        const screenPosition = vec(
            (event.clientX - rect.left) * cv.width / rect.width,
            (event.clientY - rect.top) * cv.height / rect.height
        );
        const {x, y, buttonWidth, buttonHeight, eraserX, executeX, executeWidth, menuY, menuWidth, rowHeight} = NODE_PICKER;
        if(screenPosition.x >= executeX && screenPosition.x <= executeX + executeWidth &&
           screenPosition.y >= y && screenPosition.y <= y + buttonHeight){
            this.nodePickerOpen = false;
            this.startNode?.execute();
            event.preventDefault();
            return;
        }
        if(screenPosition.x >= x && screenPosition.x <= x + buttonWidth &&
           screenPosition.y >= y && screenPosition.y <= y + buttonHeight){
            this.nodePickerOpen = !this.nodePickerOpen;
            event.preventDefault();
            return;
        }
        if(screenPosition.x >= eraserX && screenPosition.x <= eraserX + buttonWidth &&
           screenPosition.y >= y && screenPosition.y <= y + buttonHeight){
            this.eraserMode = !this.eraserMode;
            this.hoveredEraseTarget = null;
            cv.style.cursor = this.eraserMode ? "crosshair" : "";
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
        if(this.isPointerOverMinimap(screenPosition)){
            event.preventDefault();
            return;
        }
        const pointerPosition = this.getWorldPointerPosition(event);
        if(this.eraserMode){
            this.eraseAt(pointerPosition);
            event.preventDefault();
            return;
        }
        if(!this.isPointerOverNode(pointerPosition)){
            const directlyHitSlot = this.getSlotVisualAt(
                pointerPosition,
                SLOT_ANGLE_PADDING / this.cam.zoom
            );
            if(directlyHitSlot !== null){
                this.draggedSlotVisual = directlyHitSlot;
                cv.setPointerCapture(event.pointerId);
                cv.style.cursor = "grabbing";
                event.preventDefault();
                return;
            }
            const nearbySlot = this.getSlotVisualAt(
                pointerPosition,
                SLOT_HOVER_PADDING / this.cam.zoom
            );
            if(nearbySlot !== null){
                this.connectingSlotVisual = nearbySlot;
                this.hoveredSlotVisual = null;
                this.hoveredSlotCanDragAngle = false;
                this.hoveredConnectionIsLegal = false;
                this.pointerWorldPosition = pointerPosition;
                cv.setPointerCapture(event.pointerId);
                cv.style.cursor = "grabbing";
                event.preventDefault();
                return;
            }
        }
        for(let i = this.nodeVisuals.length - 1; i >= 0; i--){
            const nodeVisual = this.nodeVisuals[i];
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
        this.isPanning = true;
        this.lastPanPosition = screenPosition;
        cv.setPointerCapture(event.pointerId);
        cv.style.cursor = "grabbing";
        event.preventDefault();
    }
    onPointerMove(event){
        const rect = cv.getBoundingClientRect();
        const screenPosition = vec(
            (event.clientX - rect.left) * cv.width / rect.width,
            (event.clientY - rect.top) * cv.height / rect.height
        );
        this.hoveredPickerItem = this.getPickerItemAt(screenPosition);
        this.pointerWorldPosition = this.getWorldPointerPosition(event);
        if(this.isPanning){
            const screenDelta = screenPosition.sub(this.lastPanPosition);
            this.cam.pos = this.cam.pos.sub(screenDelta.mul(1 / this.cam.zoom));
            this.lastPanPosition = screenPosition;
            this.pointerWorldPosition = this.getWorldPointerPosition(event);
            cv.style.cursor = "grabbing";
            return;
        }
        if(this.isPointerOverMinimap(screenPosition) && this.draggedNodeVisual === null &&
           this.draggedSlotVisual === null && this.connectingSlotVisual === null){
            this.hoveredSlotVisual = null;
            this.hoveredSlotCanDragAngle = false;
            this.hoveredEraseTarget = null;
            cv.style.cursor = "";
            return;
        }
        if(this.eraserMode){
            this.hoveredEraseTarget = this.hoveredPickerItem === null
                ? this.getEraseTargetAt(this.pointerWorldPosition)
                : null;
            cv.style.cursor = this.hoveredPickerItem === null ? "crosshair" : "pointer";
            return;
        }
        this.hoveredEraseTarget = null;
        if(this.draggedSlotVisual !== null){
            this.hoveredSlotVisual = null;
            this.hoveredSlotCanDragAngle = false;
            this.hoveredConnectionIsLegal = false;
            const pointerPosition = this.pointerWorldPosition;
            const nodePosition = this.draggedSlotVisual.nodeVisual.pos;
            this.draggedSlotVisual.angle = Math.atan2(
                pointerPosition.y - nodePosition.y,
                pointerPosition.x - nodePosition.x
            );
            return;
        }
        const pointerIsNearConnectionSource = this.connectingSlotVisual !== null &&
            this.pointerWorldPosition.sub(this.connectingSlotVisual.getPosition()).length() <=
                this.connectingSlotVisual.radius + SLOT_HOVER_PADDING / this.cam.zoom;
        const pointerOverNode = this.isPointerOverNode(this.pointerWorldPosition);
        this.hoveredSlotVisual = pointerOverNode || pointerIsNearConnectionSource ? null : this.getSlotVisualAt(
            this.pointerWorldPosition,
            SLOT_HOVER_PADDING / this.cam.zoom,
            this.connectingSlotVisual,
            this.connectingSlotVisual === null
        );
        this.hoveredConnectionIsLegal = this.connectingSlotVisual !== null &&
            this.hoveredSlotVisual !== null &&
            this.connectingSlotVisual.slot.canConnectToSlot(this.hoveredSlotVisual.slot);
        this.hoveredSlotCanDragAngle = this.connectingSlotVisual === null &&
            this.hoveredSlotVisual !== null &&
            this.pointerWorldPosition.sub(this.hoveredSlotVisual.getPosition()).length() <=
                this.hoveredSlotVisual.radius + SLOT_ANGLE_PADDING / this.cam.zoom;
        if(this.connectingSlotVisual !== null) return;
        if(this.draggedNodeVisual !== null){
            this.draggedNodeVisual.pos = this.getWorldPointerPosition(event).add(this.dragOffset);
            return;
        }
        if(this.hoveredPickerItem !== null){
            cv.style.cursor = "pointer";
            return;
        }
        if(this.hoveredSlotVisual !== null){
            cv.style.cursor = "grab";
            return;
        }

        cv.style.cursor = "grab";
    }
    onPointerUp(event){
        if(this.draggedNodeVisual === null && this.draggedSlotVisual === null && this.connectingSlotVisual === null && !this.isPanning) return;
        if(this.connectingSlotVisual !== null){
            this.onPointerMove(event);
            const targetSlotVisual = this.getSlotVisualAt(
                this.pointerWorldPosition,
                SLOT_HOVER_PADDING / this.cam.zoom,
                this.connectingSlotVisual
            );
            if(targetSlotVisual !== null) this.connectingSlotVisual.slot.connect(targetSlotVisual.slot);
        }
        this.draggedNodeVisual = null;
        this.draggedSlotVisual = null;
        this.connectingSlotVisual = null;
        this.isPanning = false;
        this.lastPanPosition = null;
        if(cv.hasPointerCapture(event.pointerId)) cv.releasePointerCapture(event.pointerId);
        cv.style.cursor = "";
        this.onPointerMove(event);
    }
    drawMinimap(){
        const map = {x: MINIMAP.x, y: cv.height - MINIMAP.height - MINIMAP.margin, width: MINIMAP.width, height: MINIMAP.height, padding: 10};
        const viewWidth = cv.width / this.cam.zoom;
        const viewHeight = cv.height / this.cam.zoom;
        let minX = this.cam.pos.x - viewWidth/2;
        let maxX = this.cam.pos.x + viewWidth/2;
        let minY = this.cam.pos.y - viewHeight/2;
        let maxY = this.cam.pos.y + viewHeight/2;
        for(const nodeVisual of this.nodeVisuals){
            const halfSize = nodeVisual.size.mul(.5);
            minX = Math.min(minX, nodeVisual.pos.x - halfSize.x);
            maxX = Math.max(maxX, nodeVisual.pos.x + halfSize.x);
            minY = Math.min(minY, nodeVisual.pos.y - halfSize.y);
            maxY = Math.max(maxY, nodeVisual.pos.y + halfSize.y);
        }
        const worldWidth = Math.max(1, maxX - minX);
        const worldHeight = Math.max(1, maxY - minY);
        const paddingX = Math.max(24, worldWidth * .06);
        const paddingY = Math.max(24, worldHeight * .06);
        minX -= paddingX;
        maxX += paddingX;
        minY -= paddingY;
        maxY += paddingY;
        const scale = Math.min(
            (map.width - map.padding * 2) / (maxX - minX),
            (map.height - map.padding * 2) / (maxY - minY)
        );
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const toMap = position => vec(
            map.x + map.width/2 + (position.x - centerX) * scale,
            map.y + map.height/2 + (position.y - centerY) * scale
        );

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(map.x, map.y, map.width, map.height, 8);
        ctx.fillStyle = "rgba(11, 16, 32, 0.88)";
        ctx.fill();
        ctx.strokeStyle = STROKE_COL;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.roundRect(map.x + 1, map.y + 1, map.width - 2, map.height - 2, 7);
        ctx.clip();
        for(const nodeVisual of this.nodeVisuals){
            const center = toMap(nodeVisual.pos);
            const nodeWidth = Math.max(4, nodeVisual.size.x * scale);
            const nodeHeight = Math.max(4, nodeVisual.size.y * scale);
            ctx.fillStyle = nodeVisual.node === this.startNode ? "#E8B85A" : "#8AA2C0";
            ctx.fillRect(center.x - nodeWidth/2, center.y - nodeHeight/2, nodeWidth, nodeHeight);
        }
        const viewTopLeft = toMap(vec(this.cam.pos.x - viewWidth/2, this.cam.pos.y - viewHeight/2));
        const viewBottomRight = toMap(vec(this.cam.pos.x + viewWidth/2, this.cam.pos.y + viewHeight/2));
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(
            viewTopLeft.x,
            viewTopLeft.y,
            Math.max(2, viewBottomRight.x - viewTopLeft.x),
            Math.max(2, viewBottomRight.y - viewTopLeft.y)
        );
        ctx.restore();
    }
    drawConnectionTooltip(){
        if(this.connectingSlotVisual === null || this.hoveredSlotVisual === null ||
           this.pointerWorldPosition === null) return;
        const error = this.connectingSlotVisual.slot.getConnectionError(this.hoveredSlotVisual.slot);
        if(error === null) return;

        ctx.save();
        ctx.font = "13px Helvetica";
        const maxTextWidth = Math.max(48, Math.min(300, cv.width - 32));
        const lines = [];
        let line = "";
        for(const word of error.split(/\s+/)){
            const candidate = line.length === 0 ? word : `${line} ${word}`;
            if(line.length > 0 && ctx.measureText(candidate).width > maxTextWidth){
                lines.push(line);
                line = word;
            } else {
                line = candidate;
            }
        }
        if(line.length > 0) lines.push(line);
        const lineHeight = 18;
        const boxWidth = Math.min(maxTextWidth + 20,
            Math.max(...lines.map(text => ctx.measureText(text).width)) + 20);
        const boxHeight = lines.length * lineHeight + 12;
        const pointer = worldToCanvas(this.pointerWorldPosition, this.cam);
        const x = Math.max(8, Math.min(pointer.x + 14, cv.width - boxWidth - 8));
        const y = Math.max(8, Math.min(pointer.y + 16, cv.height - boxHeight - 8));

        ctx.beginPath();
        ctx.roundRect(x, y, boxWidth, boxHeight, 6);
        ctx.fillStyle = "#321F28";
        ctx.fill();
        ctx.strokeStyle = "#EF7777";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = NODE_TEXT_COL;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        lines.forEach((text, index) => ctx.fillText(text, x + 10, y + 6 + index * lineHeight));
        ctx.restore();
    }
    draw(){
        ctx.fillStyle = BACKGROUND_COL;
        ctx.fillRect(0, 0, cv.width, cv.height);
        for(let slotVisual of this.slotVisuals.values()){
            slotVisual.drawConnections(this.cam);
        }
        if(this.connectingSlotVisual !== null && this.pointerWorldPosition !== null){
            const start = worldToCanvas(this.connectingSlotVisual.getConnectionPosition(), this.cam);
            const end = worldToCanvas(this.pointerWorldPosition, this.cam);
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.strokeStyle = "#F1F5F9";
            ctx.lineWidth = this.cam.zoom * 2;
            ctx.stroke();
        }
        for(let nodeVisual of this.nodeVisuals){
            nodeVisual.draw(this.cam);
        }
        this.drawNodePicker();
        this.drawMinimap();
        this.drawConnectionTooltip();
    }
}
const cam = {}
class NodeVisual{
    constructor(node, pos, space){
        this.node = node;
        this.pos = pos;
        this.space = space;
        this.size = vec(64, 64);
        this.sloteVisuals = [];
        const inputSlots = this.node.getInputSlots();
        const outputSlots = this.node.getOutputSlots();
        const straightFaceHalfWidth = this.size.x / 2 - 10;
        const createAngle = (direction, index, count) => {
            const x = count === 1
                ? 0
                : -straightFaceHalfWidth + 2 * straightFaceHalfWidth * index / (count - 1);
            const y = direction === DIRECTIONS.INPUT ? -this.size.y / 2 : this.size.y / 2;
            return Math.atan2(y, x);
        };
        const slotAngles = new Map();
        for(const [slots, direction] of [[inputSlots, DIRECTIONS.INPUT], [outputSlots, DIRECTIONS.OUTPUT]]){
            slots.forEach((slot, index) => slotAngles.set(slot, createAngle(direction, index, slots.length)));
        }
        for(let slot of this.node.slots){
            const slotVisual = new SlotVisual(slot, this, slotAngles.get(slot), space);
            this.sloteVisuals.push(slotVisual);
            space.slotVisuals.set(slot, slotVisual);
        }
    }
    draw(cam){
        let cornerSp = worldToCanvas(this.pos.sub(this.size.mul(.5)), cam);
        let centerSp = worldToCanvas(this.pos, cam);
        ctx.beginPath();
        ctx.roundRect(cornerSp.x, cornerSp.y, this.size.x*cam.zoom, this.size.y*cam.zoom, cam.zoom*10);
        ctx.fillStyle = NODE_BACKGROUND_COL;
        ctx.fill();
        const isEraseTarget = this.space.eraserMode &&
            this.space.hoveredEraseTarget?.nodeVisual === this;
        ctx.strokeStyle = isEraseTarget ? "#EF4444" : STROKE_COL;
        ctx.lineWidth = isEraseTarget ? cam.zoom*3 : cam.zoom*2;
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
        this.radius = 9;
        this.space = space;
    }
    getOuterPosition(){
        const offset = this.radius + 2;
        let shift = getRectEdgePosition(
            this.nodeVisual.size.add(vec(offset*2)),
            this.angle,
            10 + offset
        );
        return this.nodeVisual.pos.add(shift);
    }
    getPosition(){
        const outerPosition = this.getOuterPosition();
        if(this.slot.direction !== DIRECTIONS.OUTPUT || this.slot.type === ControlType) return outerPosition;
        const outward = vec(Math.cos(this.getFacingAngle()), Math.sin(this.getFacingAngle()));
        return outerPosition.sub(outward.mul(this.radius + 2));
    }
    getFacingAngle(){
        const offset = this.radius + 2;
        const halfWidth = this.nodeVisual.size.x / 2 + offset;
        const halfHeight = this.nodeVisual.size.y / 2 + offset;
        const cornerRadius = 10 + offset;
        const straightX = halfWidth - cornerRadius;
        const straightY = halfHeight - cornerRadius;
        const shift = this.getOuterPosition().sub(this.nodeVisual.pos);

        if(Math.abs(shift.x) <= straightX){
            return shift.y < 0 ? -Math.PI / 2 : Math.PI / 2;
        }
        if(Math.abs(shift.y) <= straightY){
            return shift.x < 0 ? Math.PI : 0;
        }

        const cornerCenter = vec(
            (shift.x < 0 ? -1 : 1) * straightX,
            (shift.y < 0 ? -1 : 1) * straightY
        );
        const cornerNormal = shift.sub(cornerCenter);
        return Math.atan2(cornerNormal.y, cornerNormal.x);
    }
    getConnectionPosition(){
        const position = this.getPosition();
        const angle = this.getFacingAngle();
        const outward = vec(Math.cos(angle), Math.sin(angle));
        if(this.slot.type === ControlType){
            // Both triangle directions connect at the vertex or midpoint of the base edge.
            return position.add(outward.mul(this.radius));
        }
        if(this.slot.direction === DIRECTIONS.INPUT) return position;

        // The output semicircle connects at the outermost point on its curved edge.
        return position.add(outward.mul(this.radius));
    }
    drawConnections(cam){
        if(this.slot.direction !== DIRECTIONS.INPUT) return;
        const start = worldToCanvas(this.getConnectionPosition(), cam);
        for(let connectedSlot of this.slot.connectedSlots){
            const connectedVisual = this.space.slotVisuals.get(connectedSlot);
            if(connectedVisual === undefined) continue;
            const end = worldToCanvas(connectedVisual.getConnectionPosition(), cam);
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            const eraseTarget = this.space.hoveredEraseTarget;
            const isEraseTarget = this.space.eraserMode && eraseTarget?.inputSlot === this.slot &&
                eraseTarget.outputSlot === connectedSlot;
            ctx.strokeStyle = isEraseTarget ? "#EF4444" : STROKE_COL;
            ctx.lineWidth = isEraseTarget ? cam.zoom*4 : cam.zoom*2;
            ctx.stroke();
        }
    }
    traceShape(cam){
        const radius = cam.zoom * this.radius;
        if(this.slot.type === ControlType){
            const direction = this.slot.direction === DIRECTIONS.OUTPUT ? 1 : -1;
            ctx.moveTo(direction * radius, 0);
            ctx.lineTo(-direction * radius, -radius * 0.86);
            ctx.lineTo(-direction * radius, radius * 0.86);
            ctx.closePath();
            return;
        }

        ctx.moveTo(0, -radius);
        if(this.slot.direction === DIRECTIONS.OUTPUT){
            ctx.arc(0, 0, radius, -Math.PI/2, Math.PI/2);
        } else {
            ctx.arc(0, 0, radius, -Math.PI/2, Math.PI/2, true);
        }
        ctx.closePath();
    }
    draw(cam){
        let pos = this.getPosition();
        let shift = pos.sub(this.nodeVisual.pos);
        let sp = worldToCanvas(pos, cam);
        const isAngleDragging = this.space.draggedSlotVisual === this;
        const isConnecting = this.space.connectingSlotVisual === this;
        const isHoveredForAngle = this.space.connectingSlotVisual === null &&
            this.space.hoveredSlotVisual === this && this.space.hoveredSlotCanDragAngle;
        const isHoveredForConnection = this.space.hoveredSlotVisual === this && !this.space.hoveredSlotCanDragAngle;
        ctx.save();
        ctx.translate(sp.x, sp.y);
        ctx.rotate(this.getFacingAngle());
        ctx.beginPath();
        this.traceShape(cam);
        ctx.fillStyle = isAngleDragging || isHoveredForAngle ? "#FFFFFF" : STROKE_COL;
        ctx.fill();
        if(isConnecting || (isHoveredForConnection && !isAngleDragging)){
            const ringLineWidth = cam.zoom * 2;
            ctx.beginPath();
            this.traceShape(cam);
            ctx.strokeStyle = isHoveredForConnection && this.space.connectingSlotVisual !== null &&
                !this.space.hoveredConnectionIsLegal
                ? "#EF4444"
                : "#FFFFFF";
            ctx.lineWidth = ringLineWidth;
            ctx.stroke();
        }
        ctx.restore();
        ctx.fillStyle = SLOT_TEXT_COL;
        let textSideSign = shift.x < 0 ? -1 : 1;
        ctx.textAlign = shift.x < 0 ? "right" : "left";
        const connectionSp = worldToCanvas(this.getConnectionPosition(), cam);
        ctx.fillText(this.slot.name, sp.x+this.radius*textSideSign, connectionSp.y);
    }
}
