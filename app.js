const Operation = require('./libs/operation');

let someExternalValue = 0;
function standardExecLogger(ctx, msg) {
	const lastResult = ctx.execResults[ctx.execResults.length - 1];
	if (lastResult instanceof Error) {
		console.error(lastResult.stack);
	} else {
		console.log(msg);
	}
}

function add1Factory() {
	const op = Operation.create({
		postDuringExecOnlyHook: (ctx) => {
			return standardExecLogger(ctx, `added 1 to ${someExternalValue}`);
		},
		postDuringUndoOnlyHook: (ctx) => {
			return standardExecLogger(ctx, `restoring value to ${ctx.oldVal}`);
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
			if (ctx.oldVal === 2) throw new Error('Can\'t go to 5');
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
add1_1.exec(5, 500).then((execResults) => {
	// console.log('Exec results:');
	// console.log(Operation.prettyPrint(execResults));
	return execResults;
}).catch((execResults) => {
	// console.log('Exec results:');
	// console.log(Operation.prettyPrint(execResults));
	return add1_1.undo(5, 500);
}).then((undoResults) => {
	// console.log('Undo results:');
	// console.log(Operation.prettyPrint(undoResults));
	return undoResults;
}).catch((undoResults) => {	
	// console.log('Undo results:');
	// console.log(Operation.prettyPrint(undoResults));
	return undoResults;
});
