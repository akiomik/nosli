export default class Tag {
  constructor(
    public typ: string,
    public value: string,
    public relay: string | undefined = undefined,
    public marker: string | undefined = undefined
  ) {}

  public static fromEvent(tag: string[]): Tag | undefined {
    if (tag.length < 2) {
      return undefined;
    } else if (tag.length == 2) {
      return new Tag(tag[0], tag[1]);
    } else if (tag.length == 3) {
      return new Tag(tag[0], tag[1], tag[2]);
    } else {
      return new Tag(tag[0], tag[1], tag[2], tag[3]);
    }
  }

  public isEvent(): boolean {
    return this.typ === 'e';
  }

  public isPubkey(): boolean {
    return this.typ === 'p';
  }

  public isTag(): boolean {
    return this.typ === 't';
  }
}
