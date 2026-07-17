export const isPvpMode = location.pathname.startsWith("/pvp");
let latestPvpState:any=null;
let latestPvpSend:((message:Record<string,unknown>)=>void)|null=null;

export function pvpWsUrl(defaultUrl: string) {
  if (!isPvpMode) return defaultUrl;
  const token=sessionStorage.getItem("cooprpg_pvp_reconnect_token");
  const base=defaultUrl.replace(/\/ws(?:\?.*)?$/, "/ws/pvp");
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

export function adaptPvpSnapshot(raw:any, previous:any) {
  if (!isPvpMode) return raw;
  const classes=raw.classes??previous?.classes??{};
  const abilities=raw.abilities??previous?.abilities??{};
  const attributes=raw.attributes??previous?.attributes??{};
  const players=Object.fromEntries(Object.entries<any>(raw.players||{}).map(([id,p])=>[id,{
    ...p, level:1,xp:0,jumping:Boolean(p.jumping),jumpProgress:p.jumpProgress||0,pendingUpgrades:[],autoAttack:{remaining:0,interval:p.stats?.autoAttackInterval||1.5,progress:0},baseStats:p.stats||{},
  }]));
  const matchStats=Object.fromEntries(Object.entries<any>(players).map(([id,p])=>[id,{name:p.name,classId:p.classId,spectator:p.spectator,level:1,damageDealt:p.statsSummary?.damage||0,healingDone:p.statsSummary?.healing||0,damageTaken:0,kills:p.statsSummary?.kills||0,deaths:p.statsSummary?.deaths||0,biggestHit:0}]));
  return {...raw,players,enemies:{},mapObjects:[],mapRevision:1,groundEffects:raw.groundEffects||[],abilities,classes,attributes,upgrades:[],matchStats,wave:{number:1,state:raw.matchState==="running"?"active":"break",aliveEnemies:Object.values<any>(players).filter(p=>!p.spectator&&!p.dead).length,nextWaveIn:raw.preparation||0},countdown:raw.countdown,matchState:raw.matchState,reconnectToken:raw.reconnectToken};
}

export function installPvpLobby(send:(message:Record<string,unknown>)=>void) {
  if (!isPvpMode) return;
  document.body.classList.add("pvpUnified");
  for(const selector of ["#classPreviewInfo","#lobbyStatsDrawer","#statTooltip"]){const element=document.querySelector<HTMLElement>(selector);if(element)element.style.display="none";}
  const lobby=document.querySelector<HTMLElement>("#lobby")!;
  lobby.innerHTML=`<header class="pvpUnifiedHeader"><div><span>COOP RPG ARENA · PVP</span><h1>Blade Gorge</h1><p>The same heroes and the same combat engine.</p></div><a href="/">Coop Mode</a></header><main class="pvpUnifiedGrid"><section><h2>Blue Team</h2><div id="pvpBlue"></div><button data-team="blue" data-testid="team-blue">Join Blue</button></section><section class="pvpBuild"><label>Name<input id="playerName" maxlength="18" data-testid="pvp-name"></label><h2>Class</h2><div id="pvpClasses" class="pvpClassGrid"></div><div class="pvpTabs"><button data-tab="spells">Spells</button><button data-tab="stats">Attributes</button><button id="pvpReset">Reset</button></div><div id="pvpChoices"></div><footer><button id="pvpBot" data-testid="pvp-add-bot">+ Training Bot</button><span id="pvpHint"></span><button id="pvpReady" data-testid="pvp-ready">Ready</button></footer></section><section><h2>Red Team</h2><div id="pvpRed"></div><button data-team="red" data-testid="team-red">Join Red</button></section></main><div id="pvpCountdown" data-testid="pvp-countdown"></div>`;
  lobby.dataset.pvpTab="spells";
  lobby.onclick=(event)=>{const el=event.target as HTMLElement;const team=el.closest<HTMLElement>("[data-team]")?.dataset.team;const cls=el.closest<HTMLElement>("[data-class]")?.dataset.class;const choice=el.closest<HTMLElement>("[data-choice]")?.dataset.choice;const tab=el.closest<HTMLElement>("[data-tab]")?.dataset.tab;if(team)send({type:"select_team",team});if(cls)send({type:"select_class",classId:cls});if(choice)send({type:"toggle_build",choice});if(tab){lobby.dataset.pvpTab=tab;if(latestPvpState&&latestPvpSend)renderPvpLobby(latestPvpState,latestPvpSend);}};
  lobby.querySelector("#pvpReset")!.addEventListener("click",()=>send({type:"reset_build"}));
}

export function renderPvpLobby(state:any,send:(message:Record<string,unknown>)=>void) {
  latestPvpState=state;latestPvpSend=send;
  if(!isPvpMode)return; const lobby=document.querySelector<HTMLElement>("#lobby")!; const me=state.players[state.you];if(!me)return;
  lobby.style.display=state.matchState==="lobby"?"block":"none"; document.body.dataset.mode=state.matchState;
  const card=(p:any)=>`<div class="pvpPlayer"><b>${p.name}</b><span>${state.classes[p.classId]?.name||"No class"}</span><em>${p.ready?"Ready":"Not ready"}</em></div>`;
  lobby.querySelector("#pvpBlue")!.innerHTML=Object.values<any>(state.players).filter(p=>p.team==="blue"&&!p.spectator).map(card).join("");lobby.querySelector("#pvpRed")!.innerHTML=Object.values<any>(state.players).filter(p=>p.team==="red"&&!p.spectator).map(card).join("");
  lobby.querySelector("#pvpClasses")!.innerHTML=Object.values<any>(state.classes).map(c=>`<button data-class="${c.id}" data-testid="pvp-class-${c.id}" class="${me.classId===c.id?"selected":""}">${c.name}</button>`).join("");
  const tab=lobby.dataset.pvpTab||"spells"; const entries=tab==="spells"?Object.values<any>(state.abilities).filter(a=>a.classId===me.classId).map(a=>({id:`spell:${a.id}`,name:a.name,test:`pvp-spell-${a.id}`})):Object.entries<any>(state.attributes||{}).map(([id,a])=>({id:`stat:${id}`,name:a.name,test:`pvp-stat-${id}`}));
  lobby.querySelector("#pvpChoices")!.innerHTML=entries.map(e=>`<button data-choice="${e.id}" data-testid="${e.test}" class="${me.build.includes(e.id)?"selected":""}">${e.name}<b>${me.build.filter((x:string)=>x===e.id).length||"+"}</b></button>`).join("");
  const bot=Object.values<any>(state.players).some(p=>p.isBot||p.name==="Trainingsbot");const botButton=lobby.querySelector<HTMLButtonElement>("#pvpBot")!;botButton.textContent=bot?"− Training Bot":"+ Training Bot";botButton.onclick=()=>send({type:bot?"remove_training_bot":"add_training_bot",classId:"warrior"});
  const ready=lobby.querySelector<HTMLButtonElement>("#pvpReady")!;ready.disabled=!(me.team&&me.classId&&me.build.length===state.buildPoints);ready.textContent=me.ready?"Not Ready":"Ready";ready.onclick=()=>send({type:"ready",ready:!me.ready});
  lobby.querySelector("#pvpHint")!.textContent=`${me.build.length}/${state.buildPoints} points`;lobby.querySelector("#pvpCountdown")!.textContent=state.countdown!==null?`Battle begins in ${Math.ceil(state.countdown)}`:"";
  const input=lobby.querySelector<HTMLInputElement>("#playerName")!;if(document.activeElement!==input)input.value=me.name;input.onchange=()=>send({type:"set_name",name:input.value});
}
