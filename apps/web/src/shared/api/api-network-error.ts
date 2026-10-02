export class ApiNetworkError extends Error {
  constructor() {
    super("Schedlane could not be reached");
    this.name = "ApiNetworkError";
  }
}
