console.log("Checking environment...");
console.log("typeof window:", typeof window);
console.log("typeof global:", typeof global);
console.log("typeof localStorage:", typeof localStorage);
if (typeof localStorage !== "undefined") {
  console.log("localStorage:", localStorage);
  console.log("localStorage.getItem:", localStorage.getItem);
}
console.log("Done.");
