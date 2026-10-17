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

const nodes = [a, b, sum, double, str, printNode, doubleStr, printNode2, equalityNode, startSplit];
startSplit.execute();

const space = new Space(nodes);
function render(){
    space.draw();
    requestAnimationFrame(render);
}
requestAnimationFrame(render);
