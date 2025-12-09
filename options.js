(async () => {
const KEY = { opts: "bth:options" };
const DEFAULTS = {
softTagLimit: 20,
presets: {
"VRCワールド": ["VRChat","World","Unity","Udon","UdonSharp"],
"配布ツール": ["Unity","EditorTool","Utility","Booth","ツール"]
}
};


const $ = (id)=>document.getElementById(id);


const loadOpts = async ()=>{
const { [KEY.opts]:opts } = await chrome.storage.local.get(KEY.opts);
return Object.assign({}, DEFAULTS, opts||{});
};
const saveOpts = async (opts)=> chrome.storage.local.set({ [KEY.opts]: opts });


async function render(){
const o = await loadOpts();
$("limit").value = o.softTagLimit;
$("presets").value = JSON.stringify(o.presets, null, 2);
}


$("save").addEventListener("click", async ()=>{
try {
const softTagLimit = parseInt($("limit").value, 10);
const presets = JSON.parse($("presets").value || "{}");
await saveOpts({ softTagLimit, presets });
alert("保存しました");
} catch(e){
alert("JSONが不正です: " + e.message);
}
});


$("reset").addEventListener("click", async ()=>{
await saveOpts(DEFAULTS);
await render();
alert("初期化しました");
});


render();
})();