# aspen

## What

Aspen applies the command pattern to a trinary tree to build a powerful and flexible framework for organizing sequences of operations.

An "operation" in this context is any sequence of actions which can be preceded and followed by another operation. When an operation is asked to execute, it first executes the operation specified as its before operation, then itself, then the operation specified as its after operation. 

The sequence of actions of an operation can be anything from making an HTTP request to modifying a value in memory. It can even include building and adding new operations to the operation tree.

Operations are typically undo-able. They don't HAVE to be, but they SHOULD be.

Operations have memory; this can be leveraged to create complex undo logic which is capable of precisely recreating the state of the environment before operation execution. They can also store statistics about themselves.

In all, operations must abide by the following cardinal rules:
1. Must be capable of being executed by itself with no dependence on operations happening before or after it
2. Must be capable of specifying 0 or 1 before child which it must execute before it executes itself
3. Must be capable of specifying 0 or 1 after child which it must execute after it executes itself
4. Must pass down requests to add a before or after child to the already existing before or after child if the slot is already taken
5. Must allow for new operations to be added as children of itself during its sequence of actions; these operations must complete execution before the after child is executed
6. Must be capable of retrying its non-operation logic in case of failure
7. Must be seralizable and deserializable

Fortunately, the issue of following these rules has been fully abstracted out via this framework. The result is an API for creating complex trees of resource-modifying operations which can span hundreds of actions, retry and correct failures, completely undo itself from any point, provide full insight and reporting on errors and successes, and be saved to text to be re-imported later for replay.

## Why

There's really just three things that make software great:
1. It performs well no matter whether it needs to run one or one million times
2. It tries to fix the errors it encounters before it reports them
3. It cleans up after itself

Most software engineering involves receiving a request from someone and then making changes to a bunch of things and then responding saying you made those changes. I needed a framework that allowed me to chain infinite numbers of those changes in any order I wanted, in parallel or in a particular sequence. I also needed that framework to allow me to retry failed operations, and to undo everything that had happened prior to an error if that error couldn't be overcome. This is that framework.

## How

Coming soon!
