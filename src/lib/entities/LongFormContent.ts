export default class LongFormContent {
  public static KIND = 30023;

  constructor(
    public id: string | undefined,
    public identifier: string,
    public pubkey: string,
    public content: string,
    public createdAt: Date,
    public title: string,
    public summary: string,
    public image: string | undefined,
    public publishedAt: Date | undefined
  ) {}
}
