const Operation = require('./libs/operation');

let someExternalValue = 0;
function errorLogger(results) {
	if (Array.isArray(results) && results.length > 0) {
		const lastResult = results[results.length - 1];

		if (lastResult instanceof Error) {
			console.log(lastResult.stack);
		}
	}
}

function retryLogger(tryNum, msg) {
	if (tryNum > 0) msg = `attempt #${tryNum + 1}: ${msg}`;
	console.log(msg);
}

const Add1 = Operation({
	preDuringTryExecOnlyHook: (num, ctx) => {
		return retryLogger(ctx.phases.execFunctionAttempt, `adding ${num} to ${someExternalValue}`);
	},
	postDuringTryExecOnlyHook: (num, ctx) => {
		return errorLogger(ctx.opResults);
	},
	postDuringTryUndoOnlyHook: (num, ctx) => {
		return retryLogger(ctx.phases.undoFunctionAttempt, `restoring value to ${ctx.oldVal}`);
	},
	preDuringTryUndoOnlyHook: (num, ctx) => {
		return errorLogger(ctx.opUndoResults);
	},
	exec: async (num, ctx) => {
		// if (someExternalValue === 15) throw new Error('Bad 15');
		ctx.oldVal = someExternalValue;
		someExternalValue += num;
		return {
			newValue: someExternalValue
		};
	},
	undo:  async (num, ctx) => {
		if (ctx.oldVal === 2) throw new Error('Bad 2');
		someExternalValue = ctx.oldVal;
		return {
			restoredValue: someExternalValue
		};
	}
});

const add1_1 = Add1.create(1);
const add1_2 = Add1.create(2);
const add1_3 = Add1.create(3);
const add1_4 = Add1.create(4);
const add1_5 = Add1.create(5);
const add1_6 = Add1.create(6);
const add1_7 = Add1.create(7);
const add1_8 = Add1.create(8);

add1_4.addChild(add1_1, true).addChild(add1_2, true).addChild(add1_3, true).addChild(add1_5).addChild(add1_6).addChild(add1_7).addChild(add1_8);
add1_1.exec(5, 1).then((execResults) => {
	console.log(execResults);
	return execResults;
}).catch((execResults) => {
	return add1_1.undo(5, 1);
}).then((undoResults) => {
	return undoResults;
}).catch((undoResults) => {	
	return undoResults;
});
