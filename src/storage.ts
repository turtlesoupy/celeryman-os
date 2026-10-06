// Browsers that block site data throw on any localStorage access, including
// reading the property itself. Preferences are conveniences: fall back silently.
export const safeStorage:Pick<Storage,'getItem'|'setItem'>={
 getItem(key){try{return window.localStorage.getItem(key);}catch{return null;}},
 setItem(key,value){try{window.localStorage.setItem(key,value);}catch{/* Not persisted. */}},
};
