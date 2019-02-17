const Operation = require('./libs/operation');

let someExternalValue = 0;
function add1Factory() {
	const op = Operation.create({
		preDuringHook: (ctx) => {
			console.log(`adding 1 to ${someExternalValue}`);
		},
		exec: async (ctx) => {
			if (someExternalValue === 6) throw new Error('Can\'t go from 6 to 7');
			ctx.oldVal = someExternalValue;
			someExternalValue += 1;
			return {
				newValue: someExternalValue
			};
		},
		undo:  async (ctx) => {
			if (ctx.oldVal === 5) throw new Error('Can\'t go to 5');
			someExternalValue = ctx.oldVal;
			return {
				restoredValue: someExternalValue
			};
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
add1_1.exec(5, 1).then((execResults) => {
	console.log('Exec results:');
	console.log(Operation.prettyPrint(execResults));
	console.log(process._getActiveHandles()[2]);
	console.log(process._getActiveRequests());

	return execResults;
}).catch((execResults) => {
	console.log('Exec results:');
	console.log(Operation.prettyPrint(execResults));
	return execResults;
	return add1_1.undo(5, 1);
}).then((undoResults) => {
	console.log('Undo results:');
	console.log(Operation.prettyPrint(undoResults));
	return undoResults;
}).catch((undoResults) => {	
	console.log('Undo results:');
	console.log(Operation.prettyPrint(undoResults));
	return undoResults;
});
