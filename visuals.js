const BACKGROUND_COL = "#0B1020";
const NODE_BACKGROUND_COL = "#17243A";
const CONTROL_NODE_BACKGROUND_COL = "#302D33";
const STROKE_COL = "#526783";
const START_NODE_COL = "#E8B85A";
const FUNCTION_COL = "#E889B8";
const SLOT_TEXT_COL = "#A9B9D0";
const NODE_TEXT_COL = "#F1F5F9";
const SLOT_DRAG_PADDING = 3;
const SLOT_ANGLE_PADDING = 0;
const SLOT_HOVER_PADDING = 18;
const CONNECTION_LINE_WIDTH = 2;
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
const NODE_PICKER = {x: 16, y: 16, buttonWidth: 48, buttonHeight: 48, eraserX: 72, executeX: 128, executeWidth: 120, saveX: 256, loadX: 328, fileButtonWidth: 64, functionX: 400, functionWidth: 150, confirmX: 400, confirmWidth: 104, cancelX: 512, cancelWidth: 76, menuY: 76, menuWidth: 190, rowHeight: 32};


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
        this.draggedFunctionDefinition = null;
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
        this.functionSelectionMode = false;
        this.selectedFunctionSlots = new Set();
        this.functionDefinitionVisuals = [];
        this.refreshNodeTypes();
        this.rebuildFunctionDefinitionVisuals();
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
        if(type.functionId){
            node = new UserFunctionNode(type.functionId);
        } else if(type.NodeType === NumberNode){
            const rawValue = window.prompt("Enter a number:");
            if(rawValue === null || rawValue.trim() === "") return;
            const value = Number(rawValue);
            if(!Number.isFinite(value)){
                window.alert("Please enter a valid finite number.");
                return;
            }
            node = new NumberNode(value);
        } else if(type.NodeType === StringNode){
            const value = window.prompt("Enter a string:");
            if(value === null) return;
            node = new StringNode(value);
        } else {
            node = new type.NodeType();
        }
        if(node === null) return;
        this.nodes.push(node);
        this.nodeVisuals.push(new NodeVisual(node, this.cam.pos.copy(), this));
    }
    refreshNodeTypes(){
        this.nodeTypes = NODE_TYPES.map(NodeType => ({
            NodeType,
            name: NodeType.displayName || new NodeType().name
        }));
        for(const definition of USER_FUNCTION_DEFINITIONS.values()){
            this.nodeTypes.push({functionId: definition.id, name: definition.name});
        }
    }
    rebuildFunctionDefinitionVisuals(){
        this.functionDefinitionVisuals = [];
        for(const definition of USER_FUNCTION_DEFINITIONS.values()){
            const records = new Map((definition.visuals?.nodes || []).map(record => [record.nodeId, record]));
            const visuals = definition.nodes.map((node, nodeId) => {
                const record = records.get(nodeId);
                const position = record?.position || {x: definition.bounds.left, y: definition.bounds.top};
                const visual = new NodeVisual(node, vec(position.x, position.y), this);
                visual.isFunctionDefinitionVisual = true;
                for(const slotVisual of visual.sloteVisuals) this.slotVisuals.set(slotVisual.slot, slotVisual);
                if(Array.isArray(record?.slotAngles)){
                    record.slotAngles.forEach((angle, index) => {
                        if(visual.sloteVisuals[index]) visual.sloteVisuals[index].angle = angle;
                    });
                }
                return visual;
            });
            this.functionDefinitionVisuals.push({definition, visuals});
            this.updateFunctionDefinitionBounds(this.functionDefinitionVisuals[this.functionDefinitionVisuals.length - 1]);
        }
    }
    updateFunctionDefinitionBounds(group){
        if(group.visuals.length === 0) return;
        const padding = 24;
        const titleHeight = 34;
        group.definition.bounds = {
            left: Math.min(...group.visuals.map(visual => visual.pos.x - visual.size.x / 2)) - padding,
            right: Math.max(...group.visuals.map(visual => visual.pos.x + visual.size.x / 2)) + padding,
            top: Math.min(...group.visuals.map(visual => visual.pos.y - visual.size.y / 2)) - padding - titleHeight,
            bottom: Math.max(...group.visuals.map(visual => visual.pos.y + visual.size.y / 2)) + padding
        };
    }
    syncFunctionDefinitionVisuals(){
        for(const group of this.functionDefinitionVisuals){
            this.updateFunctionDefinitionBounds(group);
            const visualByNode = new Map(group.visuals.map(visual => [visual.node, visual]));
            group.definition.visuals = {
                nodes: this.getDefinitionVisualRecords(group.definition.nodes, visualByNode)
            };
        }
    }
    getAllNodeVisuals(){
        return [
            ...this.nodeVisuals,
            ...this.functionDefinitionVisuals.flatMap(group => group.visuals)
        ];
    }
    getFunctionDefinitionAt(position){
        for(let i = this.functionDefinitionVisuals.length - 1; i >= 0; i--){
            const group = this.functionDefinitionVisuals[i];
            const {left, right, top, bottom} = group.definition.bounds;
            if(position.x >= left && position.x <= right && position.y >= top && position.y <= bottom){
                return group;
            }
        }
        return null;
    }
    getFunctionDefinitionTitleAt(screenPosition){
        for(let i = this.functionDefinitionVisuals.length - 1; i >= 0; i--){
            const {definition} = this.functionDefinitionVisuals[i];
            const topLeft = worldToCanvas(vec(definition.bounds.left, definition.bounds.top), this.cam);
            const fontSize = 15 * this.cam.zoom;
            ctx.save();
            ctx.font = `bold ${fontSize}px Helvetica`;
            const width = ctx.measureText(definition.name).width;
            ctx.restore();
            const titleX = topLeft.x + 14 * this.cam.zoom;
            const titleY = topLeft.y + 12 * this.cam.zoom;
            if(screenPosition.x >= titleX - 5 * this.cam.zoom &&
               screenPosition.x <= titleX + width + 5 * this.cam.zoom &&
               screenPosition.y >= titleY - 3 * this.cam.zoom &&
               screenPosition.y <= titleY + 19 * this.cam.zoom){
                return this.functionDefinitionVisuals[i];
            }
        }
        return null;
    }
    editFunctionName(group){
        const name = window.prompt("Edit function name:", group.definition.name);
        if(name === null || name.trim() === "") return;
        group.definition.name = name.trim();
        for(const visual of this.getAllNodeVisuals()){
            if(visual.node instanceof UserFunctionNode && visual.node.functionId === group.definition.id){
                visual.node.name = group.definition.name;
            }
        }
        this.refreshNodeTypes();
    }
    editSlotName(node){
        const name = window.prompt("Edit slot name:", node.getPortName());
        if(name === null) return;
        node.name = name.trim();
        if(node.boundaryPortId){
            for(const definition of USER_FUNCTION_DEFINITIONS.values()){
                const port = definition.ports.find(candidate => candidate.id === node.boundaryPortId);
                if(!port) continue;
                port.name = node.name;
                for(const visual of this.getAllNodeVisuals()){
                    if(visual.node instanceof UserFunctionNode && visual.node.functionId === definition.id){
                        visual.node.slots.forEach((slot, index) => {
                            if(definition.ports[index] === port) slot.name = port.name || null;
                        });
                    }
                }
                break;
            }
        }
    }
    getDefinitionVisualRecords(nodes, visualByNode){
        return nodes.map((node, nodeId) => {
            const visual = visualByNode.get(node);
            return {
                nodeId,
                position: {x: visual.pos.x, y: visual.pos.y},
                slotAngles: node.slots.map(slot => this.slotVisuals.get(slot)?.angle ?? 0)
            };
        });
    }
    getSlotNodePort(slotNode){
        if(slotNode instanceof DataSlotNode){
            const inputConnected = slotNode.valueInputSlot.connectedSlots.length > 0;
            const outputConnected = slotNode.valueOutputSlot.connectedSlots.length > 0;
            if(inputConnected === outputConnected){
                return {error: `Slot node “${slotNode.getPortName()}” needs exactly one of its data slots connected.`};
            }
            const direction = inputConnected ? "output" : "input";
            const connectedSlot = inputConnected ? slotNode.valueInputSlot.connectedSlots[0] : slotNode.valueOutputSlot.connectedSlots[0];
            const type = connectedSlot.getResolvedType() || connectedSlot.type;
            return {direction, type, name: slotNode.getPortName(), boundarySlot: slotNode,
                connectedSlot, internalSlot: inputConnected ? slotNode.valueInputSlot : slotNode.valueOutputSlot};
        }
        if(slotNode instanceof ControlSlotNode){
            const inputConnected = slotNode.controlInputSlot.connectedSlots.length > 0;
            const outputConnected = slotNode.controlOutputSlot.connectedSlots.length > 0;
            if(inputConnected === outputConnected){
                return {error: `Control slot “${slotNode.getPortName()}” needs exactly one of its control slots connected.`};
            }
            const direction = inputConnected ? "output" : "input";
            return {direction, type: ControlType, name: slotNode.getPortName(), boundarySlot: slotNode,
                connectedSlot: inputConnected ? slotNode.controlInputSlot.connectedSlots[0] : slotNode.controlOutputSlot.connectedSlots[0],
                internalSlot: inputConnected ? slotNode.controlInputSlot : slotNode.controlOutputSlot};
        }
        return {error: "Select only data slot and control slot nodes."};
    }
    confirmFunctionSelection(){
        if(this.selectedFunctionSlots.size === 0){
            window.alert("Select at least one data slot or control slot node first.");
            return;
        }
        const selectedNodes = [...this.selectedFunctionSlots];
        const ports = selectedNodes.map(node => this.getSlotNodePort(node));
        const invalidPort = ports.find(port => port.error);
        if(invalidPort){
            window.alert(invalidPort.error);
            return;
        }
        const selectedSet = new Set(selectedNodes);
        const regionNodes = new Set(selectedNodes);
        const pendingNodes = ports.map(port => port.connectedSlot.node);
        while(pendingNodes.length > 0){
            const node = pendingNodes.pop();
            if(selectedSet.has(node) || regionNodes.has(node)) continue;
            if(node instanceof StartNode){
                window.alert("A function cannot contain the start node. Place a selected slot node between the start and the function body.");
                return;
            }
            regionNodes.add(node);
            for(const slot of node.slots){
                for(const connectedSlot of slot.connectedSlots){
                    if(selectedSet.has(connectedSlot.node)) continue;
                    pendingNodes.push(connectedSlot.node);
                }
            }
        }
        const regionVisuals = this.nodeVisuals.filter(visual => regionNodes.has(visual.node));
        for(const node of selectedNodes){
            const port = ports[selectedNodes.indexOf(node)];
            if(!regionNodes.has(port.connectedSlot.node)){
                window.alert(`The connected side of “${port.name}” must lead into the selected function area.`);
                return;
            }
        }
        for(const node of regionNodes){
            for(const slot of node.slots){
                for(const connectedSlot of slot.connectedSlots){
                    if(regionNodes.has(connectedSlot.node)) continue;
                    window.alert("Every connection crossing the function border must pass through one of the selected slot nodes. Move the function boundary or select the missing slot node.");
                    return;
                }
            }
        }
        const name = window.prompt("Name this function:", "new function");
        if(name === null || name.trim() === "") return;
        const id = `function-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const portRecords = ports.map((port, index) => {
            const slotNode = selectedNodes[index];
            const portId = `${id}-port-${index}`;
            slotNode.boundaryPortId = portId;
            slotNode.boundaryDirection = port.direction;
            let type = port.type;
            if(type instanceof TypeVariable){
                type = new TypeVariable(`T${index + 1}`);
            }
            return {id: portId, name: port.name, direction: port.direction, type,
                typeVariableName: type instanceof TypeVariable ? type.name : null};
        });
        const bounds = {
            left: Math.min(...regionVisuals.map(visual => visual.pos.x - visual.size.x/2)) - 24,
            right: Math.max(...regionVisuals.map(visual => visual.pos.x + visual.size.x/2)) + 24,
            top: Math.min(...regionVisuals.map(visual => visual.pos.y - visual.size.y/2)) - 24,
            bottom: Math.max(...regionVisuals.map(visual => visual.pos.y + visual.size.y/2)) + 24
        };
        const visualByNode = new Map(regionVisuals.map(visual => [visual.node, visual]));
        const definition = new FunctionDefinition(id, name.trim(), [...regionNodes], portRecords, bounds, {nodes: []});
        definition.visuals = {nodes: this.getDefinitionVisualRecords(definition.nodes, visualByNode)};
        USER_FUNCTION_DEFINITIONS.set(id, definition);
        this.nodes = this.nodes.filter(node => !regionNodes.has(node));
        this.nodeVisuals = this.nodeVisuals.filter(visual => !regionNodes.has(visual.node));
        this.startNode = this.nodes.find(node => node instanceof StartNode) || null;
        this.slotVisuals = new Map();
        for(const visual of this.nodeVisuals) for(const slotVisual of visual.sloteVisuals) this.slotVisuals.set(slotVisual.slot, slotVisual);
        this.nodePickerOpen = false;
        this.functionSelectionMode = false;
        this.selectedFunctionSlots.clear();
        this.refreshNodeTypes();
        this.rebuildFunctionDefinitionVisuals();
    }
    serializeVisuals(){
        this.syncFunctionDefinitionVisuals();
        const nodeVisuals = new Map(this.nodeVisuals.map(nodeVisual => [nodeVisual.node, nodeVisual]));
        const nodes = this.nodes.map((node, nodeId) => {
            const nodeVisual = nodeVisuals.get(node);
            return {
                nodeId,
                position: {x: nodeVisual.pos.x, y: nodeVisual.pos.y},
                slotAngles: node.slots.map(slot => this.slotVisuals.get(slot)?.angle ?? 0)
            };
        });
        return {
            camera: {x: this.cam.pos.x, y: this.cam.pos.y, zoom: this.cam.zoom},
            nodes
        };
    }
    serializeProgram(){
        return {
            format: "visual-language-program",
            version: 2,
            model: {...serializeModel(this.nodes), functions: serializeFunctionDefinitions()},
            visuals: {...this.serializeVisuals(), functions: serializeFunctionDefinitionVisuals()}
        };
    }
    saveProgram(){
        const file = new Blob([JSON.stringify(this.serializeProgram(), null, 2)], {
            type: "application/json"
        });
        const url = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = url;
        link.download = "visual-language-program.json";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }
    loadProgram(program){
        let modelData;
        let visualData;
        if(program?.format === "visual-language-program" && (program.version === 1 || program.version === 2)){
            deserializeFunctionDefinitions(program.version >= 2 ? program.model?.functions : [], program.visuals?.functions || []);
            modelData = program.model;
            visualData = program.visuals;
        } else if(program?.version === 2 && Array.isArray(program.data?.nodes) &&
                  Array.isArray(program.data?.connections) && Array.isArray(program.visual?.nodes)){
            deserializeFunctionDefinitions([]);
            modelData = {version: 1, nodes: program.data.nodes, connections: program.data.connections};
            visualData = {
                camera: program.visual.camera,
                nodes: program.visual.nodes.map((record, nodeId) => ({...record, nodeId}))
            };
        } else if(program?.version === 1 && Array.isArray(program.nodes) &&
                  Array.isArray(program.connections)){
            deserializeFunctionDefinitions([]);
            // Keep compatibility with files that stored model and visual fields together.
            modelData = {version: 1, nodes: program.nodes, connections: program.connections};
            visualData = {
                camera: program.camera,
                nodes: program.nodes.map((record, nodeId) => ({
                    nodeId,
                    position: record.position,
                    slotAngles: record.slotAngles
                }))
            };
        } else {
            throw new Error("Unsupported or invalid program file.");
        }
        const model = deserializeModel(modelData);
        if(!Array.isArray(visualData?.nodes) || visualData.nodes.length !== model.nodes.length){
            throw new Error("Program file has mismatched model and visual node counts.");
        }
        const visualsByNodeId = new Map();
        for(const record of visualData.nodes){
            const node = model.nodesById.get(record?.nodeId);
            if(!node || visualsByNodeId.has(record.nodeId) ||
               !Number.isFinite(record.position?.x) || !Number.isFinite(record.position?.y)){
                throw new Error("Program file contains invalid node visuals.");
            }
            if(record.slotAngles !== undefined &&
               (!Array.isArray(record.slotAngles) || record.slotAngles.length !== node.slots.length ||
                record.slotAngles.some(angle => !Number.isFinite(angle)))){
                throw new Error("Program file contains invalid slot angles.");
            }
            visualsByNodeId.set(record.nodeId, record);
        }
        for(const nodeId of model.nodesById.keys()){
            if(!visualsByNodeId.has(nodeId)) throw new Error("Program file is missing node visuals.");
        }

        const camera = visualData.camera || {};
        this.cam.pos = vec(
            Number.isFinite(camera.x) ? camera.x : 0,
            Number.isFinite(camera.y) ? camera.y : 0
        );
        this.cam.zoom = Number.isFinite(camera.zoom) ? Math.max(0.2, Math.min(4, camera.zoom)) : 1;
        const loadedNodes = model.nodes;
        this.nodes.splice(0, this.nodes.length, ...loadedNodes);
        this.startNode = loadedNodes.find(node => node instanceof StartNode);
        this.slotVisuals = new Map();
        this.nodeVisuals = loadedNodes.map(node => {
            const nodeId = model.nodeIdsByNode.get(node);
            const record = visualsByNodeId.get(nodeId);
            return new NodeVisual(node, vec(record.position.x, record.position.y), this);
        });
        this.slotVisuals = new Map();
        this.nodeVisuals.forEach(visual => visual.sloteVisuals.forEach(slotVisual => this.slotVisuals.set(slotVisual.slot, slotVisual)));
        loadedNodes.forEach(node => {
            const nodeId = model.nodeIdsByNode.get(node);
            const record = visualsByNodeId.get(nodeId);
            if(record.slotAngles === undefined) return;
            record.slotAngles.forEach((angle, slotIndex) => {
                this.slotVisuals.get(node.slots[slotIndex]).angle = angle;
            });
        });
        this.rebuildFunctionDefinitionVisuals();
        this.draggedNodeVisual = null;
        this.draggedSlotVisual = null;
        this.connectingSlotVisual = null;
        this.isPanning = false;
        this.hoveredSlotVisual = null;
        this.hoveredSlotCanDragAngle = false;
        this.hoveredConnectionIsLegal = false;
        this.hoveredEraseTarget = null;
        this.eraserMode = false;
        this.nodePickerOpen = false;
        this.functionSelectionMode = false;
        this.selectedFunctionSlots.clear();
        this.refreshNodeTypes();
        cv.style.cursor = "";
    }
    chooseProgramFile(){
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = ".json,application/json";
        fileInput.addEventListener("change", async () => {
            const file = fileInput.files?.[0];
            if(!file) return;
            try{
                this.loadProgram(JSON.parse(await file.text()));
            } catch(error){
                window.alert(`Could not load program: ${error.message}`);
            }
        }, {once: true});
        fileInput.click();
    }
    drawNodePicker(){
        const {x, y, buttonWidth, buttonHeight, eraserX, executeX, executeWidth, saveX, loadX, fileButtonWidth,
            functionX, functionWidth, confirmX, confirmWidth, cancelX, cancelWidth, menuY, menuWidth, rowHeight} = NODE_PICKER;
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
        for(const [key, buttonX, label] of [["save", saveX, "Save"], ["load", loadX, "Load"]]){
            ctx.beginPath();
            ctx.roundRect(buttonX, y, fileButtonWidth, buttonHeight, 8);
            ctx.fillStyle = this.hoveredPickerItem === key ? "#293D59" : NODE_BACKGROUND_COL;
            ctx.fill();
            ctx.strokeStyle = STROKE_COL;
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = NODE_TEXT_COL;
            ctx.font = "14px Helvetica";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(label, buttonX + fileButtonWidth/2, y + buttonHeight/2);
        }
        if(this.functionSelectionMode){
            for(const [key, buttonX, width, label] of [["confirm-function", confirmX, confirmWidth, "Confirm"], ["cancel-function", cancelX, cancelWidth, "Cancel"]]){
                ctx.beginPath();
                ctx.roundRect(buttonX, y, width, buttonHeight, 8);
                ctx.fillStyle = this.hoveredPickerItem === key ? "#493044" : NODE_BACKGROUND_COL;
                ctx.fill();
                ctx.strokeStyle = FUNCTION_COL;
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.fillStyle = NODE_TEXT_COL;
                ctx.font = "14px Helvetica";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(label, buttonX + width/2, y + buttonHeight/2);
            }
            ctx.fillStyle = FUNCTION_COL;
            ctx.font = "13px Helvetica";
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            ctx.fillText(`Select slot nodes (${this.selectedFunctionSlots.size}), then confirm.`, confirmX, y + buttonHeight + 8);
        } else {
            ctx.beginPath();
            ctx.roundRect(functionX, y, functionWidth, buttonHeight, 8);
            ctx.fillStyle = this.hoveredPickerItem === "create-function" ? "#493044" : NODE_BACKGROUND_COL;
            ctx.fill();
            ctx.strokeStyle = FUNCTION_COL;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = NODE_TEXT_COL;
            ctx.font = "14px Helvetica";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("Create function", functionX + functionWidth/2, y + buttonHeight/2);
        }
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
            const isUserFunction = Boolean(this.nodeTypes[i].functionId);
            if(this.hoveredPickerItem === i){
                ctx.fillStyle = isUserFunction ? "#493044" : "#293D59";
                ctx.fillRect(x + 6, rowTop, menuWidth - 12, rowHeight);
            }
            ctx.fillStyle = isUserFunction ? FUNCTION_COL : SLOT_TEXT_COL;
            ctx.fillText(this.nodeTypes[i].name, x + 12, rowTop + rowHeight/2);
        }
        ctx.restore();
    }
    getPickerItemAt(position){
        const {x, y, buttonWidth, buttonHeight, eraserX, executeX, executeWidth, saveX, loadX, fileButtonWidth,
            functionX, functionWidth, confirmX, confirmWidth, cancelX, cancelWidth, menuY, menuWidth, rowHeight} = NODE_PICKER;
        if(position.x >= eraserX && position.x <= eraserX + buttonWidth &&
           position.y >= y && position.y <= y + buttonHeight) return "eraser";
        if(position.x >= executeX && position.x <= executeX + executeWidth &&
           position.y >= y && position.y <= y + buttonHeight) return "execute";
        if(position.x >= saveX && position.x <= saveX + fileButtonWidth &&
           position.y >= y && position.y <= y + buttonHeight) return "save";
        if(position.x >= loadX && position.x <= loadX + fileButtonWidth &&
           position.y >= y && position.y <= y + buttonHeight) return "load";
        if(this.functionSelectionMode){
            if(position.x >= confirmX && position.x <= confirmX + confirmWidth && position.y >= y && position.y <= y + buttonHeight) return "confirm-function";
            if(position.x >= cancelX && position.x <= cancelX + cancelWidth && position.y >= y && position.y <= y + buttonHeight) return "cancel-function";
        } else if(position.x >= functionX && position.x <= functionX + functionWidth &&
           position.y >= y && position.y <= y + buttonHeight) return "create-function";
        if(position.x >= x && position.x <= x + buttonWidth &&
           position.y >= y && position.y <= y + buttonHeight) return "button";
        if(!this.nodePickerOpen || position.x < x || position.x > x + menuWidth ||
           position.y < menuY + 6 || position.y >= menuY + 6 + this.nodeTypes.length * rowHeight) return null;
        return Math.floor((position.y - menuY - 6) / rowHeight);
    }
    getSlotVisualAt(position, extraRadius = 0, sourceSlotVisual = null, filterLegal = true){
        let closest = null;
        let closestDistance = Infinity;
        const nodeVisuals = this.getAllNodeVisuals();
        for(let i = nodeVisuals.length - 1; i >= 0; i--){
            const nodeVisual = nodeVisuals[i];
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
        const nodeVisuals = this.getAllNodeVisuals();
        for(let i = nodeVisuals.length - 1; i >= 0; i--){
            if(this.isPointOverNode(position, nodeVisuals[i])) return nodeVisuals[i];
        }
        return null;
    }
    isPointerOverNode(position){
        return this.getNodeVisualAt(position) !== null;
    }
    getEraseTargetAt(position){
        let nodeVisual = null;
        for(let i = this.nodeVisuals.length - 1; i >= 0; i--){
            if(this.isPointOverNode(position, this.nodeVisuals[i])){
                nodeVisual = this.nodeVisuals[i];
                break;
            }
        }
        if(nodeVisual !== null && nodeVisual.node !== this.startNode) return {nodeVisual};

        let closestTarget = null;
        const pointerScreenPosition = worldToCanvas(position, this.cam);
        const hitPadding = 8 * this.cam.zoom;
        const previousLineWidth = ctx.lineWidth;
        ctx.lineWidth = CONNECTION_LINE_WIDTH * this.cam.zoom + hitPadding * 2;
        for(const candidateVisual of this.nodeVisuals){
            for(const inputSlot of candidateVisual.node.getInputSlots()){
                const inputVisual = this.slotVisuals.get(inputSlot);
                if(inputVisual === undefined) continue;
                for(const outputSlot of inputSlot.connectedSlots){
                    const outputVisual = this.slotVisuals.get(outputSlot);
                    if(outputVisual === undefined) continue;
                    inputVisual.traceConnectionPath(outputVisual, this.cam);
                    if(ctx.isPointInStroke(pointerScreenPosition.x, pointerScreenPosition.y)){
                        closestTarget = {inputSlot, outputSlot};
                        break;
                    }
                }
                if(closestTarget !== null) break;
            }
            if(closestTarget !== null) break;
        }
        ctx.lineWidth = previousLineWidth;
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
        const map = this.getMinimapRect();
        return position.x >= map.x && position.x <= map.x + map.width &&
            position.y >= map.y && position.y <= map.y + map.height;
    }
    getMinimapRect(){
        return {
            x: cv.width - MINIMAP.width - MINIMAP.margin,
            y: cv.height - MINIMAP.height - MINIMAP.margin,
            width: MINIMAP.width,
            height: MINIMAP.height,
            padding: 10
        };
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
        const {x, y, buttonWidth, buttonHeight, eraserX, executeX, executeWidth, saveX, loadX, fileButtonWidth, menuY, menuWidth, rowHeight} = NODE_PICKER;
        if(this.functionSelectionMode){
            const pickerItem = this.getPickerItemAt(screenPosition);
            if(pickerItem === "confirm-function") this.confirmFunctionSelection();
            else if(pickerItem === "cancel-function"){
                this.functionSelectionMode = false;
                this.selectedFunctionSlots.clear();
            } else {
                const pointerPosition = this.getWorldPointerPosition(event);
                const nodeVisual = this.getNodeVisualAt(pointerPosition);
                if(nodeVisual?.node instanceof DataSlotNode || nodeVisual?.node instanceof ControlSlotNode){
                    const node = nodeVisual.node;
                    if(this.selectedFunctionSlots.has(node)) this.selectedFunctionSlots.delete(node);
                    else this.selectedFunctionSlots.add(node);
                }
            }
            event.preventDefault();
            return;
        }
        const topPickerItem = this.getPickerItemAt(screenPosition);
        if(topPickerItem === "create-function"){
            this.functionSelectionMode = true;
            this.selectedFunctionSlots.clear();
            this.hoveredSlotVisual = null;
            this.hoveredSlotCanDragAngle = false;
            this.nodePickerOpen = false;
            event.preventDefault();
            return;
        }
        if(screenPosition.x >= saveX && screenPosition.x <= saveX + fileButtonWidth &&
           screenPosition.y >= y && screenPosition.y <= y + buttonHeight){
            this.nodePickerOpen = false;
            this.saveProgram();
            event.preventDefault();
            return;
        }
        if(screenPosition.x >= loadX && screenPosition.x <= loadX + fileButtonWidth &&
           screenPosition.y >= y && screenPosition.y <= y + buttonHeight){
            this.nodePickerOpen = false;
            this.chooseProgramFile();
            event.preventDefault();
            return;
        }
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
        const functionTitle = this.getFunctionDefinitionTitleAt(screenPosition);
        if(functionTitle !== null){
            this.editFunctionName(functionTitle);
            event.preventDefault();
            return;
        }
        const hitNodeVisual = this.getNodeVisualAt(pointerPosition);
        const slotNameHalfWidth = 28;
        const slotNameHalfHeight = 10;
        const hitNodeLabel = hitNodeVisual !== null &&
            Math.abs(pointerPosition.x - hitNodeVisual.pos.x) <= slotNameHalfWidth &&
            Math.abs(pointerPosition.y - hitNodeVisual.pos.y) <= slotNameHalfHeight;
        if(hitNodeLabel && (hitNodeVisual.node instanceof DataSlotNode || hitNodeVisual.node instanceof ControlSlotNode)){
            this.editSlotName(hitNodeVisual.node);
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
        const nodeVisuals = this.getAllNodeVisuals();
        for(let i = nodeVisuals.length - 1; i >= 0; i--){
            const nodeVisual = nodeVisuals[i];
            if(this.isPointOverNode(pointerPosition, nodeVisual)){
                this.draggedNodeVisual = nodeVisual;
                this.dragOffset = nodeVisual.pos.sub(pointerPosition);
                cv.setPointerCapture(event.pointerId);
                cv.style.cursor = "grabbing";
                event.preventDefault();
                return;
            }
        }
        const functionGroup = this.getFunctionDefinitionAt(pointerPosition);
        if(functionGroup !== null){
            this.draggedFunctionDefinition = functionGroup;
            this.lastFunctionDragPosition = pointerPosition;
            cv.setPointerCapture(event.pointerId);
            cv.style.cursor = "grabbing";
            event.preventDefault();
            return;
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
        if(this.functionSelectionMode){
            this.hoveredSlotVisual = null;
            this.hoveredSlotCanDragAngle = false;
            const nodeVisual = this.getNodeVisualAt(this.getWorldPointerPosition(event));
            cv.style.cursor = this.hoveredPickerItem !== null ||
                nodeVisual?.node instanceof DataSlotNode || nodeVisual?.node instanceof ControlSlotNode
                ? "pointer" : "default";
            return;
        }
        this.pointerWorldPosition = this.getWorldPointerPosition(event);
        if(this.draggedFunctionDefinition !== null){
            const delta = this.pointerWorldPosition.sub(this.lastFunctionDragPosition);
            for(const visual of this.draggedFunctionDefinition.visuals){
                visual.pos = visual.pos.add(delta);
            }
            this.lastFunctionDragPosition = this.pointerWorldPosition;
            this.updateFunctionDefinitionBounds(this.draggedFunctionDefinition);
            cv.style.cursor = "grabbing";
            return;
        }
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
            if(this.draggedNodeVisual.isFunctionDefinitionVisual){
                const group = this.functionDefinitionVisuals.find(candidate =>
                    candidate.visuals.includes(this.draggedNodeVisual)
                );
                if(group !== undefined) this.updateFunctionDefinitionBounds(group);
            }
            return;
        }
        const hoveredSlotNameNode = this.getNodeVisualAt(this.pointerWorldPosition);
        const isHoveringSlotName = hoveredSlotNameNode !== null &&
            (hoveredSlotNameNode.node instanceof DataSlotNode || hoveredSlotNameNode.node instanceof ControlSlotNode) &&
            Math.abs(this.pointerWorldPosition.x - hoveredSlotNameNode.pos.x) <= 28 &&
            Math.abs(this.pointerWorldPosition.y - hoveredSlotNameNode.pos.y) <= 10;
        if(isHoveringSlotName || this.getFunctionDefinitionTitleAt(screenPosition) !== null){
            cv.style.cursor = "pointer";
            return;
        }
        if(this.getFunctionDefinitionAt(this.pointerWorldPosition) !== null){
            cv.style.cursor = "grab";
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
        if(this.draggedNodeVisual === null && this.draggedFunctionDefinition === null && this.draggedSlotVisual === null && this.connectingSlotVisual === null && !this.isPanning) return;
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
        this.draggedFunctionDefinition = null;
        this.lastFunctionDragPosition = null;
        this.draggedSlotVisual = null;
        this.connectingSlotVisual = null;
        this.isPanning = false;
        this.lastPanPosition = null;
        if(cv.hasPointerCapture(event.pointerId)) cv.releasePointerCapture(event.pointerId);
        cv.style.cursor = "";
        this.onPointerMove(event);
    }
    drawMinimap(){
        const map = this.getMinimapRect();
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
        for(const {definition} of this.functionDefinitionVisuals){
            minX = Math.min(minX, definition.bounds.left);
            maxX = Math.max(maxX, definition.bounds.right);
            minY = Math.min(minY, definition.bounds.top);
            maxY = Math.max(maxY, definition.bounds.bottom);
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
        for(const {definition} of this.functionDefinitionVisuals){
            const topLeft = toMap(vec(definition.bounds.left, definition.bounds.top));
            const bottomRight = toMap(vec(definition.bounds.right, definition.bounds.bottom));
            const width = Math.max(2, bottomRight.x - topLeft.x);
            const height = Math.max(2, bottomRight.y - topLeft.y);
            ctx.beginPath();
            ctx.roundRect(topLeft.x, topLeft.y, width, height, Math.min(4, width / 4, height / 4));
            ctx.fillStyle = "rgba(232, 137, 184, 0.16)";
            ctx.fill();
            ctx.strokeStyle = FUNCTION_COL;
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        for(const nodeVisual of this.getAllNodeVisuals()){
            const center = toMap(nodeVisual.pos);
            const nodeWidth = Math.max(3, nodeVisual.size.x * scale);
            const nodeHeight = Math.max(3, nodeVisual.size.y * scale);
            ctx.fillStyle = nodeVisual.node === this.startNode ? START_NODE_COL :
                nodeVisual.isFunctionDefinitionVisual ? FUNCTION_COL : "#8AA2C0";
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
    drawDotGrid(){
        const spacing = 48;
        const halfViewWidth = cv.width / (2 * this.cam.zoom);
        const halfViewHeight = cv.height / (2 * this.cam.zoom);
        const left = this.cam.pos.x - halfViewWidth;
        const right = this.cam.pos.x + halfViewWidth;
        const top = this.cam.pos.y - halfViewHeight;
        const bottom = this.cam.pos.y + halfViewHeight;
        const dotRadius = Math.max(1, 1.3 * this.cam.zoom);

        const firstX = Math.ceil(left / spacing) * spacing;
        const firstY = Math.ceil(top / spacing) * spacing;
        ctx.beginPath();
        for(let x = firstX; x <= right; x += spacing){
            for(let y = firstY; y <= bottom; y += spacing){
                const point = worldToCanvas(vec(x, y), this.cam);
                ctx.moveTo(point.x + dotRadius, point.y);
                ctx.arc(point.x, point.y, dotRadius, 0, Math.PI * 2);
            }
        }
        ctx.fillStyle = "rgba(127, 155, 185, 0.3)";
        ctx.fill();
    }
    draw(){
        ctx.fillStyle = BACKGROUND_COL;
        ctx.fillRect(0, 0, cv.width, cv.height);
        this.drawDotGrid();
        this.drawFunctionDefinitionFrames();
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
        for(const group of this.functionDefinitionVisuals){
            for(const nodeVisual of group.visuals) nodeVisual.draw(this.cam);
        }
        this.drawNodePicker();
        this.drawMinimap();
        this.drawConnectionTooltip();
        this.drawSlotValueTooltip();
    }
    drawFunctionDefinitionFrames(){
        for(const {definition} of this.functionDefinitionVisuals){
            const topLeft = worldToCanvas(vec(definition.bounds.left, definition.bounds.top), this.cam);
            const bottomRight = worldToCanvas(vec(definition.bounds.right, definition.bounds.bottom), this.cam);
            const width = bottomRight.x - topLeft.x;
            const height = bottomRight.y - topLeft.y;
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(topLeft.x, topLeft.y, width, height, 18 * this.cam.zoom);
            ctx.fillStyle = "rgba(232, 137, 184, 0.09)";
            ctx.fill();
            ctx.strokeStyle = FUNCTION_COL;
            ctx.lineWidth = Math.max(1.5, this.cam.zoom * 2);
            ctx.stroke();
            ctx.fillStyle = FUNCTION_COL;
            ctx.font = `bold ${15 * this.cam.zoom}px Helvetica`;
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            const titleX = topLeft.x + 14 * this.cam.zoom;
            const titleY = topLeft.y + 12 * this.cam.zoom;
            const titleWidth = ctx.measureText(definition.name).width;
            const pointer = this.pointerWorldPosition === null
                ? null
                : worldToCanvas(this.pointerWorldPosition, this.cam);
            const isNameHovered = pointer !== null &&
                pointer.x >= titleX - 5 * this.cam.zoom &&
                pointer.x <= titleX + titleWidth + 5 * this.cam.zoom &&
                pointer.y >= titleY - 3 * this.cam.zoom &&
                pointer.y <= titleY + 19 * this.cam.zoom;
            ctx.beginPath();
            ctx.roundRect(titleX - 5 * this.cam.zoom, titleY - 3 * this.cam.zoom,
                titleWidth + 10 * this.cam.zoom, 22 * this.cam.zoom, 5 * this.cam.zoom);
            ctx.fillStyle = isNameHovered ? "#744464" : "#5A3550";
            ctx.fill();
            if(isNameHovered){
                ctx.strokeStyle = FUNCTION_COL;
                ctx.lineWidth = Math.max(1, this.cam.zoom);
                ctx.stroke();
            }
            ctx.fillStyle = FUNCTION_COL;
            ctx.fillText(definition.name, topLeft.x + 14 * this.cam.zoom, topLeft.y + 12 * this.cam.zoom);
            ctx.restore();
        }
    }
    drawSlotValueTooltip(){
        const slotVisual = this.hoveredSlotVisual;
        if(slotVisual === null || slotVisual.slot.type === ControlType || this.eraserMode ||
           this.draggedSlotVisual !== null || this.connectingSlotVisual !== null || this.functionSelectionMode) return;

        const slot = slotVisual.slot;
        let cachedValue = slot.value;
        if(slot.direction === DIRECTIONS.INPUT){
            const connectedOutput = slot.connectedSlots.find(connectedSlot =>
                connectedSlot.direction === DIRECTIONS.OUTPUT
            );
            cachedValue = connectedOutput?.value ?? null;
        }
        const valueText = cachedValue === null
            ? "not computed"
            : typeof cachedValue === "string" ? JSON.stringify(cachedValue) : String(cachedValue);
        const text = `Cached value: ${valueText}`;
        ctx.save();
        ctx.font = "13px Helvetica";
        const paddingX = 9;
        const paddingY = 6;
        const width = ctx.measureText(text).width + paddingX * 2;
        const height = 26;
        const pointer = this.pointerWorldPosition === null
            ? worldToCanvas(slotVisual.getPosition(), this.cam)
            : worldToCanvas(this.pointerWorldPosition, this.cam);
        const x = Math.max(4, Math.min(cv.width - width - 4, pointer.x + 14));
        const y = Math.max(4, Math.min(cv.height - height - 4, pointer.y + 14));
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, 5);
        ctx.fillStyle = NODE_BACKGROUND_COL;
        ctx.fill();
        ctx.strokeStyle = STROKE_COL;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = NODE_TEXT_COL;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(text, x + paddingX, y + height/2);
        ctx.restore();
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
        const isControlNode = this.node.slots.some(slot => slot.type === ControlType);
        const isSlotNode = this.node instanceof DataSlotNode || this.node instanceof ControlSlotNode;
        const isSelectedFunctionSlot = this.space.selectedFunctionSlots?.has(this.node);
        ctx.fillStyle = isSelectedFunctionSlot ? "#70405D" :
            isSlotNode ? "#48293D" : isControlNode ? CONTROL_NODE_BACKGROUND_COL : NODE_BACKGROUND_COL;
        ctx.fill();
        const isEraseTarget = this.space.eraserMode &&
            this.space.hoveredEraseTarget?.nodeVisual === this;
        ctx.strokeStyle = isEraseTarget ? "#EF4444" : isSelectedFunctionSlot ? "#FFC1DF" : isSlotNode ? FUNCTION_COL :
            isControlNode ? START_NODE_COL : STROKE_COL;
        ctx.lineWidth = isEraseTarget ? cam.zoom*3 : isSelectedFunctionSlot ? cam.zoom*4 : isSlotNode ? cam.zoom*2.5 : cam.zoom*2;
        ctx.stroke();
        if(isSelectedFunctionSlot){
            ctx.save();
            const badgeCenter = vec(cornerSp.x + (this.size.x - 12) * cam.zoom,
                cornerSp.y + 12 * cam.zoom);
            ctx.beginPath();
            ctx.arc(badgeCenter.x, badgeCenter.y, 8 * cam.zoom, 0, Math.PI * 2);
            ctx.fillStyle = "#FFC1DF";
            ctx.fill();
            ctx.strokeStyle = "#48293D";
            ctx.lineWidth = Math.max(1, 1.5 * cam.zoom);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(badgeCenter.x - 3.5 * cam.zoom, badgeCenter.y);
            ctx.lineTo(badgeCenter.x - 1 * cam.zoom, badgeCenter.y + 2.5 * cam.zoom);
            ctx.lineTo(badgeCenter.x + 3.5 * cam.zoom, badgeCenter.y - 3 * cam.zoom);
            ctx.strokeStyle = "#48293D";
            ctx.lineWidth = Math.max(1, 2 * cam.zoom);
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.stroke();
            ctx.restore();
        }
        ctx.fillStyle = NODE_TEXT_COL;
        ctx.font = (cam.zoom*16)+"px Helvetica";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle"
        const maxLabelWidth = (this.size.x - 8) * cam.zoom;
        let nodeLabel = this.node.name;
        if(this.node instanceof DataSlotNode || this.node instanceof ControlSlotNode){
            nodeLabel = this.node.getPortName();
        }
        if(this.node instanceof StringNode){
            const escapedCharacters = Array.from(this.node.valueSlot.value, character =>
                JSON.stringify(character).slice(1, -1)
            );
            nodeLabel = `"${escapedCharacters.join("")}"`;
            if(ctx.measureText(nodeLabel).width > maxLabelWidth){
                let shortenedContent = "";
                for(const escapedCharacter of escapedCharacters){
                    const candidate = `"${shortenedContent}${escapedCharacter}..."`;
                    if(ctx.measureText(candidate).width > maxLabelWidth) break;
                    shortenedContent += escapedCharacter;
                }
                nodeLabel = `"${shortenedContent}..."`;
            }
        }
        if(isSlotNode){
            ctx.font = `bold ${15 * cam.zoom}px Helvetica`;
            const labelWidth = (this.size.x - 8) * cam.zoom;
            const labelHeight = 20 * cam.zoom;
            const labelX = centerSp.x - labelWidth/2;
            const labelY = centerSp.y - labelHeight/2;
            const pointer = this.space.pointerWorldPosition;
            const isNameHovered = pointer !== null &&
                Math.abs(pointer.x - this.pos.x) <= (this.size.x - 8) / 2 &&
                Math.abs(pointer.y - this.pos.y) <= 10;
            let displayedName = nodeLabel;
            const ellipsis = "...";
            if(ctx.measureText(displayedName).width > labelWidth - 8 * cam.zoom){
                const characters = Array.from(displayedName);
                while(characters.length > 0 &&
                      ctx.measureText(`${characters.join("")}${ellipsis}`).width > labelWidth - 8 * cam.zoom){
                    characters.pop();
                }
                displayedName = `${characters.join("")}${ellipsis}`;
            }
            ctx.beginPath();
            ctx.roundRect(labelX, labelY, labelWidth, labelHeight, 5 * cam.zoom);
            ctx.fillStyle = isNameHovered ? "#744464" : "#5A3550";
            ctx.fill();
            if(isNameHovered){
                ctx.strokeStyle = FUNCTION_COL;
                ctx.lineWidth = Math.max(1, cam.zoom);
                ctx.stroke();
            }
            ctx.fillStyle = FUNCTION_COL;
            ctx.fillText(displayedName, centerSp.x, centerSp.y);
        } else {
            ctx.fillText(nodeLabel, centerSp.x, centerSp.y, maxLabelWidth);
        }
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
        // Keep the output semicircle's flat edge just clear of the node outline.
        return outerPosition.sub(outward.mul(this.radius));
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
            // Input controls connect at the base; outputs connect at the flat tip.
            if(this.slot.direction === DIRECTIONS.OUTPUT){
                const tipInset = CONNECTION_LINE_WIDTH / (2 * 0.43);
                return position.add(outward.mul(this.radius - tipInset));
            }
            return position.add(outward.mul(this.radius));
        }
        if(this.slot.direction === DIRECTIONS.INPUT) return position;

        // The output semicircle connects at the outermost point on its curved edge.
        return position.add(outward.mul(this.radius));
    }
    drawConnections(cam){
        if(this.slot.direction !== DIRECTIONS.INPUT) return;
        for(let connectedSlot of this.slot.connectedSlots){
            const connectedVisual = this.space.slotVisuals.get(connectedSlot);
            if(connectedVisual === undefined) continue;
            const isControlConnection = this.slot.type === ControlType;
            const pathStart = isControlConnection ? connectedVisual : this;
            const pathEnd = isControlConnection ? this : connectedVisual;
            pathStart.traceConnectionPath(pathEnd, cam);
            const eraseTarget = this.space.hoveredEraseTarget;
            const isEraseTarget = this.space.eraserMode && eraseTarget?.inputSlot === this.slot &&
                eraseTarget.outputSlot === connectedSlot;
            ctx.strokeStyle = isEraseTarget ? "#EF4444" :
                isControlConnection ? START_NODE_COL : STROKE_COL;
            ctx.lineWidth = isEraseTarget ? cam.zoom*4 : cam.zoom*CONNECTION_LINE_WIDTH;
            if(isControlConnection){
                const dashLength = 8 * cam.zoom;
                const gapLength = 6 * cam.zoom;
                const dashPhase = performance.now() * 0.012 % 14;
                ctx.setLineDash([dashLength, gapLength]);
                ctx.lineDashOffset = -dashPhase * cam.zoom;
            } else {
                ctx.setLineDash([]);
                ctx.lineDashOffset = 0;
            }
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.lineDashOffset = 0;
        }
    }
    traceConnectionPath(connectedVisual, cam){
        const startPosition = this.getConnectionPosition();
        const endPosition = connectedVisual.getConnectionPosition();
        const start = worldToCanvas(startPosition, cam);
        const end = worldToCanvas(endPosition, cam);
        const handleLength = endPosition.sub(startPosition).length() * 0.45;
        const startFacing = this.getFacingAngle();
        const endFacing = connectedVisual.getFacingAngle();
        const control1 = worldToCanvas(
            startPosition.add(vec(Math.cos(startFacing), Math.sin(startFacing)).mul(handleLength)),
            cam
        );
        const control2 = worldToCanvas(
            endPosition.add(vec(Math.cos(endFacing), Math.sin(endFacing)).mul(handleLength)),
            cam
        );
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.bezierCurveTo(control1.x, control1.y, control2.x, control2.y, end.x, end.y);
    }
    traceShape(cam){
        const radius = cam.zoom * this.radius;
        if(this.slot.type === ControlType){
            const direction = this.slot.direction === DIRECTIONS.OUTPUT ? 1 : -1;
            const tipHalfWidth = cam.zoom * CONNECTION_LINE_WIDTH / 2;
            const tipInset = tipHalfWidth / 0.43;
            const flatTipX = radius - tipInset;
            ctx.moveTo(direction * flatTipX, -tipHalfWidth);
            ctx.lineTo(-direction * radius, -radius * 0.86);
            ctx.lineTo(-direction * radius, radius * 0.86);
            ctx.lineTo(direction * flatTipX, tipHalfWidth);
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
    drawTypeLabel(cam, labelX, labelY, alignRight){
        const fontSize = 10 * cam.zoom;
        const typeVariable = this.slot.type instanceof TypeVariable ? this.slot.type : null;
        const resolvedType = this.slot.getResolvedType();
        const text = typeVariable === null
            ? this.slot.getTypeName()
            : typeVariable.name;
        const suffix = typeVariable !== null && resolvedType !== null
            ? ` (${resolvedType.name.replace(/Type$/, "").toLowerCase()})`
            : "";
        ctx.font = `${fontSize}px Helvetica`;
        ctx.textBaseline = "middle";
        if(typeVariable === null){
            ctx.textAlign = alignRight ? "right" : "left";
            ctx.fillStyle = "#7F9BB9";
            ctx.fillText(text, labelX, labelY);
            return;
        }

        const textWidth = ctx.measureText(text).width;
        const suffixWidth = ctx.measureText(suffix).width;
        const startX = alignRight ? labelX - textWidth - suffixWidth : labelX;
        ctx.textAlign = "left";
        ctx.fillStyle = "#B8E6C1";
        ctx.fillText(text, startX, labelY);
        if(suffix !== ""){
            ctx.fillStyle = "#7F9BB9";
            ctx.fillText(suffix, startX + textWidth, labelY);
        }
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
        ctx.fillStyle = isAngleDragging || isHoveredForAngle
            ? "#FFFFFF"
            : this.slot.type === ControlType ? START_NODE_COL : STROKE_COL;
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
        let textSideSign = shift.x < 0 ? -1 : 1;
        const connectionSp = worldToCanvas(this.getConnectionPosition(), cam);
        const labelX = sp.x + (this.radius + 4) * textSideSign * cam.zoom;
        ctx.textAlign = shift.x < 0 ? "right" : "left";
        ctx.textBaseline = "middle";
        if(this.slot.name !== null && this.slot.name !== ""){
            ctx.fillStyle = NODE_TEXT_COL;
            ctx.font = `bold ${12 * cam.zoom}px Helvetica`;
            ctx.fillText(this.slot.name, labelX, connectionSp.y - 7 * cam.zoom);
            this.drawTypeLabel(cam, labelX, connectionSp.y + 7 * cam.zoom, shift.x < 0);
        } else {
            this.drawTypeLabel(cam, labelX, connectionSp.y, shift.x < 0);
        }
    }
}
