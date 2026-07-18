export const isPvpMode = location.pathname.startsWith("/pvp");
let latestPvpState:any=null;
let latestPvpSend:((message:Record<string,unknown>)=>void)|null=null;
let lastClassMarkup="";
let lastChoiceMarkup="";

const statLabels:Record<string,string>={maxHealth:"Health",maxResource:"Resource",attackPower:"Attack Power",spellPower:"Spell Power",armor:"Armor",resistance:"Resistance",critChance:"Critical Chance",moveSpeed:"Move Speed",autoAttackDamage:"Auto Damage",cooldownReduction:"Cooldown Reduction",castSpeed:"Cast Speed",resourceCostMultiplier:"Resource Costs"};
const percentStats=new Set(["critChance","cooldownReduction"]);
const classGlyphs:Record<string,string>={warrior:"W",hunter:"H",priest:"P",mage:"M",rogue:"R",druid:"D",shaman:"S",paladin:"P"};

function escapeHtml(value:unknown){return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!));}
function formatNumber(stat:string,value:number){if(percentStats.has(stat))return `${Math.round(value*100)}%`;return Number.isInteger(value)?String(value):value.toFixed(2).replace(/0+$/,"").replace(/\.$/,"");}
function statDescription(attribute:any){
  const label=statLabels[attribute.stat]||attribute.name;
  if(attribute.mode==="mult"){
    const percent=Math.round(Math.abs(attribute.value-1)*100);
    return `${attribute.value>=1?"+":"−"}${percent}% ${label} per point`;
  }
  const amount=percentStats.has(attribute.stat)?`${Math.round(attribute.value*100)} percentage points`:formatNumber(attribute.stat,Math.abs(attribute.value));
  return `${attribute.value>=0?"+":"−"}${amount} ${label} per point`;
}
function effectSummary(effect:any){
  const amount=effect.amount??effect.value;
  const bits=[effect.type?.replaceAll("_"," ")];
  if(amount!==undefined)bits.push(`${amount}${effect.scaling?` + ${effect.scaling} scaling`:""}`);
  if(effect.duration)bits.push(`${effect.duration}s`);
  if(effect.radius)bits.push(`${effect.radius}m radius`);
  return bits.filter(Boolean).join(" · ");
}
function abilityDescription(ability:any){
  const details=(ability.effects||[]).map(effectSummary).filter(Boolean).join(" • ");
  return `${ability.description||"Class ability."}${details?` ${details}.`:""}`;
}

export function pvpWsUrl(defaultUrl:string){
  if(!isPvpMode)return defaultUrl;
  const token=sessionStorage.getItem("cooprpg_pvp_reconnect_token");
  const base=defaultUrl.replace(/\/ws(?:\?.*)?$/,"/ws/pvp");
  return token?`${base}?token=${encodeURIComponent(token)}`:base;
}

export function adaptPvpSnapshot(raw:any,previous:any){
  if(!isPvpMode)return raw;
  const classes=raw.classes??previous?.classes??{};const abilities=raw.abilities??previous?.abilities??{};const attributes=raw.attributes??previous?.attributes??{};
  const players=Object.fromEntries(Object.entries<any>(raw.players||{}).map(([id,p])=>{const serverAbilities=Array.isArray(p.abilities)?p.abilities:[];const learnedAbilities=serverAbilities.length?serverAbilities:(Array.isArray(p.build)?p.build.filter((choice:string)=>choice.startsWith("spell:")).map((choice:string)=>choice.slice(6)):[]);return[id,{...p,abilities:learnedAbilities,abilitySlots:Object.fromEntries(learnedAbilities.map((abilityId:string,index:number)=>[abilityId,index+1])),level:1,xp:0,jumping:Boolean(p.jumping),jumpProgress:p.jumpProgress||0,pendingUpgrades:[],autoAttack:{remaining:0,interval:p.stats?.autoAttackInterval||1.5,progress:0},baseStats:classes[p.classId]?.baseStats||p.stats||{}}]}));
  const matchStats=Object.fromEntries(Object.entries<any>(players).map(([id,p])=>[id,{name:p.name,classId:p.classId,spectator:p.spectator,level:1,damageDealt:p.statsSummary?.damage||0,healingDone:p.statsSummary?.healing||0,damageTaken:0,kills:p.statsSummary?.kills||0,deaths:p.statsSummary?.deaths||0,biggestHit:0}]));
  return {...raw,players,enemies:{},mapObjects:[],mapRevision:1,groundEffects:raw.groundEffects||[],abilities,classes,attributes,upgrades:[],matchStats,wave:{number:1,state:raw.matchState==="running"?"active":"break",aliveEnemies:Object.values<any>(players).filter(p=>!p.spectator&&!p.dead).length,nextWaveIn:raw.preparation||0},countdown:raw.countdown,matchState:raw.matchState,reconnectToken:raw.reconnectToken};
}

export function installPvpLobby(send:(message:Record<string,unknown>)=>void){
  if(!isPvpMode)return;
  document.body.classList.add("pvpUnified");
  const lobby=document.querySelector<HTMLElement>("#lobby")!;
  lobby.innerHTML=`<header class="pvpUnifiedHeader"><div class="pvpBrandRune"><img src="/favicon.svg" alt=""></div><div><span>COOP RPG ARENA · PVP</span><h1>Blade Gorge</h1><p>Choose your hero, forge your build, then fight for your team.</p></div><a href="/">Coop Mode</a></header><main class="pvpUnifiedGrid"><section class="pvpTeamPanel blue"><div class="pvpPanelEyebrow">Your side</div><h2>Blue Team <b id="pvpBlueCount"></b></h2><div id="pvpBlue"></div><button data-team="blue" data-testid="team-blue">Join Blue</button></section><section class="pvpBuild"><div class="pvpMobileTeams" aria-label="Choose your team"><button data-team="blue">Join Blue</button><button data-team="red">Join Red</button></div><label class="pvpName"><span>YOUR ADVENTURER</span><input id="playerName" maxlength="18" data-testid="pvp-name"></label><div class="pvpSectionTitle"><span>1</span><div><h2>Choose your hero</h2><p>Your class determines your resources and spell pool.</p></div></div><div id="pvpClasses" class="pvpClassGrid"></div><div class="pvpSectionTitle buildTitle"><span>2</span><div><h2>Forge your build</h2><p>Spells and attributes cost one talent point each.</p></div><strong><b id="pvpPointsUsed">0</b>/10 talents</strong></div><div class="pvpTabs"><button data-tab="spells">Spells</button><button data-tab="stats">Attributes</button><button id="pvpReset">Reset</button></div><div id="pvpChoices"></div><footer><button id="pvpBot" data-testid="pvp-add-bot">+ Training Bot</button><span id="pvpHint"></span><button id="pvpStats" type="button" data-testid="pvp-live-stats">◆ Live Stats</button><button id="pvpReady" data-testid="pvp-ready">Ready</button></footer></section><section class="pvpTeamPanel red"><div class="pvpPanelEyebrow">Opponents</div><h2>Red Team <b id="pvpRedCount"></b></h2><div id="pvpRed"></div><button data-team="red" data-testid="team-red">Join Red</button></section></main><aside id="pvpLiveStats" aria-label="Live character stats"><button id="pvpStatsClose" aria-label="Close live stats">×</button><div id="pvpStatsContent"></div></aside><div id="pvpCountdown" data-testid="pvp-countdown"></div>`;
  lobby.dataset.pvpTab="spells";lastClassMarkup="";lastChoiceMarkup="";
  lobby.onclick=(event)=>{const el=event.target as HTMLElement;const team=el.closest<HTMLElement>("[data-team]")?.dataset.team;const cls=el.closest<HTMLElement>("[data-class]")?.dataset.class;const choice=el.closest<HTMLElement>("[data-choice]")?.dataset.choice;const tab=el.closest<HTMLElement>("[data-tab]")?.dataset.tab;if(team)send({type:"select_team",team});if(cls)send({type:"select_class",classId:cls});if(choice)send({type:"toggle_build",choice});if(tab){lobby.dataset.pvpTab=tab;if(latestPvpState&&latestPvpSend)renderPvpLobby(latestPvpState,latestPvpSend);}};
  lobby.querySelector("#pvpReset")!.addEventListener("click",()=>send({type:"reset_build"}));
  lobby.querySelector("#pvpStats")!.addEventListener("click",()=>document.body.classList.toggle("pvpStatsOpen"));
  lobby.querySelector("#pvpStatsClose")!.addEventListener("click",()=>document.body.classList.remove("pvpStatsOpen"));
}

function renderStats(state:any,me:any){
  const content=document.querySelector<HTMLElement>("#pvpStatsContent");if(!content)return;
  if(!me.classId){content.innerHTML=`<h2>Live Stats</h2><p>Choose a class to see your character sheet.</p>`;return;}
  const base=state.classes[me.classId]?.baseStats||{};const current=me.stats||base;
  const rows=Object.keys(current).filter(stat=>statLabels[stat]).map(stat=>{const delta=(current[stat]??0)-(base[stat]??0);const changed=Math.abs(delta)>0.0001;return `<div class="pvpStatRow${changed?" changed":""}"><span>${statLabels[stat]}</span><b>${formatNumber(stat,current[stat])}${changed?` <em>${delta>0?"+":""}${formatNumber(stat,delta)}</em>`:""}</b></div>`;}).join("");
  const spent=me.build.length;content.innerHTML=`<span class="pvpPanelEyebrow">Live character sheet</span><h2>${escapeHtml(state.classes[me.classId]?.name||me.classId)}</h2><p>Values update immediately when you assign a talent.</p><div class="pvpBuildProgress"><span>Talents assigned</span><b>${spent}/${state.buildPoints}</b><i><strong style="width:${spent/state.buildPoints*100}%"></strong></i></div><div class="pvpStatGrid">${rows}</div>`;
}

export function renderPvpLobby(state:any,send:(message:Record<string,unknown>)=>void){
  latestPvpState=state;latestPvpSend=send;if(!isPvpMode)return;const lobby=document.querySelector<HTMLElement>("#lobby")!;const me=state.players[state.you];if(!me)return;
  lobby.style.display=state.matchState==="lobby"?"block":"none";document.body.dataset.mode=state.matchState;if(state.matchState!=="lobby")document.body.classList.remove("pvpStatsOpen");
  const card=(p:any)=>`<div class="pvpPlayer"><span class="pvpPlayerGlyph">${classGlyphs[p.classId]||"?"}</span><div><b>${escapeHtml(p.name)}</b><span>${escapeHtml(state.classes[p.classId]?.name||"No class")}</span></div><em>${p.ready?"Ready":"Preparing"}</em></div>`;
  const blue=Object.values<any>(state.players).filter(p=>p.team==="blue"&&!p.spectator);const red=Object.values<any>(state.players).filter(p=>p.team==="red"&&!p.spectator);
  lobby.querySelector("#pvpBlue")!.innerHTML=blue.map(card).join("");lobby.querySelector("#pvpRed")!.innerHTML=red.map(card).join("");lobby.querySelector("#pvpBlueCount")!.textContent=`${blue.length}/${state.maxTeamSize}`;lobby.querySelector("#pvpRedCount")!.textContent=`${red.length}/${state.maxTeamSize}`;
  const classMarkup=Object.values<any>(state.classes).map(c=>`<button data-class="${c.id}" data-testid="pvp-class-${c.id}" class="${me.classId===c.id?"selected":""}"><span>${classGlyphs[c.id]||c.name[0]}</span><b>${escapeHtml(c.name)}</b><small>${escapeHtml(c.description||c.resourceType||"")}</small></button>`).join("");
  if(classMarkup!==lastClassMarkup){lobby.querySelector("#pvpClasses")!.innerHTML=classMarkup;lastClassMarkup=classMarkup;}
  lobby.querySelectorAll<HTMLButtonElement>("[data-team]").forEach(button=>{const selected=button.dataset.team===me.team;button.classList.toggle("selected",selected);button.setAttribute("aria-pressed",String(selected));});
  const tab=lobby.dataset.pvpTab||"spells";lobby.querySelectorAll("[data-tab]").forEach(button=>button.classList.toggle("active",(button as HTMLElement).dataset.tab===tab));
  const entries=tab==="spells"?Object.values<any>(state.abilities).filter(a=>a.classId===me.classId).map(a=>({id:`spell:${a.id}`,name:a.name,description:abilityDescription(a),meta:`${a.range||0}m · ${a.cooldown||0}s cooldown${a.castTime?` · ${a.castTime}s cast`:""}`,test:`pvp-spell-${a.id}`})):Object.entries<any>(state.attributes||{}).map(([id,a])=>({id:`stat:${id}`,name:a.name,description:statDescription(a),meta:statLabels[a.stat]||a.stat,test:`pvp-stat-${id}`}));
  const choiceMarkup=entries.map(e=>{const count=me.build.filter((x:string)=>x===e.id).length;return `<button data-choice="${e.id}" data-testid="${e.test}" class="${count?"selected":""}"><span><b>${escapeHtml(e.name)}</b><small>${escapeHtml(e.description)}</small><em>${escapeHtml(e.meta)}</em></span><strong>${count||"+"}</strong></button>`;}).join("");
  if(choiceMarkup!==lastChoiceMarkup){lobby.querySelector("#pvpChoices")!.innerHTML=choiceMarkup;lastChoiceMarkup=choiceMarkup;}
  lobby.querySelector("#pvpPointsUsed")!.textContent=String(me.build.length);renderStats(state,me);
  const bot=Object.values<any>(state.players).some(p=>p.isBot||p.name==="Trainingsbot"||p.name==="Training Bot");const botButton=lobby.querySelector<HTMLButtonElement>("#pvpBot")!;botButton.textContent=bot?"− Training Bot":"+ Training Bot";botButton.onclick=()=>send({type:bot?"remove_training_bot":"add_training_bot",classId:"warrior"});
  const ready=lobby.querySelector<HTMLButtonElement>("#pvpReady")!;ready.disabled=!(me.team&&me.classId&&me.build.length===state.buildPoints);ready.textContent=me.ready?"Not Ready":"Ready for battle";ready.onclick=()=>send({type:"ready",ready:!me.ready});
  lobby.querySelector("#pvpHint")!.textContent=state.countdown!==null?`Starting in ${Math.ceil(state.countdown)}…`:!me.team?"Choose a team":!me.classId?"Choose a class":me.build.length!==state.buildPoints?`${me.build.length}/${state.buildPoints} talents assigned`:me.ready?"Waiting for opponent…":"Ready to fight";const countdown=lobby.querySelector<HTMLElement>("#pvpCountdown")!;countdown.textContent=state.countdown!==null?`Battle begins in ${Math.ceil(state.countdown)}`:"";countdown.classList.toggle("visible",state.countdown!==null);
  const input=lobby.querySelector<HTMLInputElement>("#playerName")!;if(document.activeElement!==input)input.value=me.name;input.onchange=()=>send({type:"set_name",name:input.value});
}
