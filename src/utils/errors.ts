
export class RecoverableError extends Error{
    constructor(message: string){
        super(message);
    }
}

export class SkipableError extends Error{
    constructor(message: string){
        super(message);
    }
}

export class FatalError extends Error{
    constructor(message: string){
        super(message);
    }
}