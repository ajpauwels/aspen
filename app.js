const Operation = require('./libs/operation');

let someExternalValue = 0;
function add1Factory() {
	const op = Operation.create({
		exec: async () => {
			if (someExternalValue === 6) throw new Error('fuck');
			op.oldVal = someExternalValue;
			someExternalValue += 1;
			return {
				newValue: someExternalValue
			};
		},
		undo:  async () => {
			if (typeof(op.oldVal) === 'number') {
				if (op.oldVal === 6) throw new Error('undo fuck');
				someExternalValue = op.oldVal;
				return {
					restoredValue: someExternalValue
				};
			} else {
				return undefined;
			}
		}
	});

	return op;
}

const add1_1 = add1Factory();
const add1_2 = add1Factory();
const add1_3 = add1Factory();
const add1_4 = add1Factory();
const add1_5 = add1Factory();
const add1_6 = add1Factory();
const add1_7 = add1Factory();
const add1_8 = add1Factory();

add1_1.addChild(add1_2, true).addChild(add1_3, true).addChild(add1_4, true).addChild(add1_5).addChild(add1_6).addChild(add1_7).addChild(add1_8);
add1_1.exec().then((execResults) => {
	console.log('Exec results:');
	console.log(Operation.prettyPrint(execResults));
}).catch((execResults) => {
	console.log('Exec results:');
	console.log(Operation.prettyPrint(execResults));
	return add1_1.undo();
}).then((undoResults) => {
	console.log('Undo results:');
	console.log(Operation.prettyPrint(undoResults));
}).catch((undoResults) => {	
	console.log('Undo results:');
	console.log(Operation.prettyPrint(undoResults));
});
