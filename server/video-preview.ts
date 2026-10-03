// Only provider-generated URLs are registered here; clients cannot proxy arbitrary URLs.
const shared=globalThis as typeof globalThis & {cincoVideoPreviews?:Map<string,string>};
export const videoPreviews=shared.cincoVideoPreviews??=new Map<string,string>();
