const Operation = require('./libs/operation');
const ParallelOperation = require('./operations/parallel');

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

const ComplexOperation = Operation({
	preDuringExecOnlyHook: async (ctx, op) => {
		const add1_1 = AddOperation.create(1);
		const add1_2 = AddOperation.create(2);
		const add1_3 = AddOperation.create(3);
		const add1_4 = AddOperation.create(4);
		const add1_5 = AddOperation.create(5);
		const add1_6 = AddOperation.create(6);
		const add1_7 = AddOperation.create(7);
		const add1_8 = AddOperation.create(8);

		add1_1.addChild(add1_2).addChild(add1_3);
		op.addChild(add1_1, true);
		await op.exec();

		const parallelOp = ParallelOperation.create([add1_4, add1_5, add1_6]);
		parallelOp.tag = 'PARALLEL';
		op.addChild(parallelOp, true);
		op.addChild(add1_7);
		op.addChild(add1_8);
	}
});

const AddOperation = Operation({
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
		if (someExternalValue + num >= 16) throw new Error(`Bad ${someExternalValue + num}`);
		ctx.oldVal = someExternalValue;
		someExternalValue += num;
		return {
			newValue: someExternalValue
		};
	},
	undo:  async (num, ctx) => {
		// if (ctx.oldVal === 0) throw new Error('Bad 0');
		someExternalValue = ctx.oldVal;
		return {
			restoredValue: someExternalValue
		};
	}
});

// const parallelOp = ParallelOperation.create([add1_1, add1_2]);
const complexOp = ComplexOperation.create();
// parallelOp.addChild(add1_3);
// parallelOp.exec(5, 1).then((results) => {
// 	console.log(results);
// });

complexOp.exec(5, 1).catch((err) => {
	console.log('exec error');
	console.log(err);
	return complexOp.undo(5, 1);
}).then((result) => {
	console.log('exec/undo success');
	console.log(result);
}).catch((err) => {
	console.log('undo error');
	console.log(err);
});

// add1_4.addChild(add1_1, true).addChild(add1_2, true).addChild(add1_3, true).addChild(add1_5).addChild(add1_6).addChild(add1_7).addChild(add1_8);
// add1_4.exec(5, 1).then((execResults) => {
// 	return execResults;
// }).catch((execResults) => {
// 	// console.log(execResults);
// 	return add1_4.undo(5, 1);
// }).then((undoResults) => {
// 	// console.log(undoResults);
// 	return undoResults;
// }).catch((undoResults) => {	
// 	// console.log(undoResults);
// 	return undoResults;
// }).then(() => {
// 	return add1_4.exec(5, 1);
// }).then((execResults) => {
// 	return execResults;
// }).catch((execResults) => {
// 	// console.log(execResults);
// 	return add1_4.undo(5, 1);
// }).then((undoResults) => {
// 	// console.log(undoResults);
// 	return undoResults;
// }).catch((undoResults) => {	
// 	// console.log(undoResults);
// 	return undoResults;
// });

