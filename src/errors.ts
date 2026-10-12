export class RecorderError extends Error {
  readonly code:string;
  readonly exitCode:1|2;
  constructor(code:string,exitCode:1|2=2){super(code);this.code=code;this.exitCode=exitCode;}
}
