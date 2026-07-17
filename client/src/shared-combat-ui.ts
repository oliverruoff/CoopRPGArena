export type SharedCastState = { abilityId: string; remaining: number; duration: number } | null;
export type SharedFramePlayer = { id:string; name:string; classId:string|null; hp:number; maxHealth:number; resource:number; maxResource:number; resourceType:string|null; dead:boolean };

const escapeHtml = (text:string) => { const node=document.createElement("div"); node.textContent=text; return node.innerHTML; };
const resourceLabel = (type:string|null) => type ? type.charAt(0).toUpperCase()+type.slice(1) : "Resource";

export function renderSharedPartyFrame(player: SharedFramePlayer, selected: boolean, effectsHtml = "", tag: "div"|"button" = "div") {
  const hpPercent=Math.max(0,player.hp/Math.max(1,player.maxHealth)*100);
  const resourcePercent=player.maxResource>0?Math.max(0,Math.min(100,player.resource/player.maxResource*100)):0;
  const resourceClass=["mana","rage","energy","focus"].includes(player.resourceType||"")?player.resourceType:"resource";
  return `<${tag} class="partyFrame${selected?" selectedTarget":""}${player.dead?" dead":""}" role="button" tabindex="0" aria-pressed="${selected}" data-testid="party-frame" data-id="${escapeHtml(player.id)}"><b class="partyName">${escapeHtml(player.name)}</b><br><span class="partyClass">${escapeHtml(player.classId||"No class")}</span><div class="mini partyHealth"><span style="width:${hpPercent}%"></span><div class="partyMeterLabel">HP ${Math.round(player.hp)}/${Math.round(player.maxHealth)}</div></div><div class="mini partyResource ${resourceClass}" data-testid="party-resource-bar"><span style="width:${resourcePercent}%"></span><div class="partyMeterLabel">${resourceLabel(player.resourceType)} ${Math.round(player.resource)}/${Math.round(player.maxResource)}</div></div><span class="partyState"${player.dead?"":" hidden"}>Down</span><div class="partyEffects">${effectsHtml}</div></${tag}>`;
}

export function updateSmoothCastBar(options: {
  container: HTMLElement;
  fill: HTMLElement;
  label: HTMLElement;
  casting: SharedCastState;
  snapshotReceivedAt: number;
  previousProgress: number;
  previousAbilityId: string;
  abilityName: string;
  visibleDisplay?: string;
}) {
  const { container, fill, label, casting } = options;
  if (!casting) {
    container.style.display = "none";
    container.classList.remove("visible");
    fill.style.transform = "scaleX(0)";
    return { progress: 0, abilityId: "" };
  }
  const previous = options.previousAbilityId === casting.abilityId ? options.previousProgress : 0;
  const elapsed = Math.max(0, (performance.now() - options.snapshotReceivedAt) / 1000);
  const duration = Math.max(0.01, casting.duration);
  const progress = Math.max(previous, Math.max(0, Math.min(1, 1 - Math.max(0, casting.remaining - elapsed) / duration)));
  container.style.display = options.visibleDisplay || "block";
  container.classList.add("visible");
  fill.style.transform = `scaleX(${progress})`;
  label.textContent = options.abilityName;
  return { progress, abilityId: casting.abilityId };
}
