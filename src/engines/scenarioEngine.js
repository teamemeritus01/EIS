import { METRIC_TARGETS, SLAB_GRID, getSlabForRank, getMinProductiveDays, getWorkingDaysRemaining } from '../constants/businessRules.js';
const T = METRIC_TARGETS;

function calcBSCFromMetrics(cc, aht, ttfa, ptt) {
  return (Math.min(cc/T.connectedCalls,1)*0.25 + Math.min(aht/T.ahtFirstCall,1)*0.25 + Math.min(ttfa/T.adjustedTTFA,1)*0.25 + Math.min(ptt/T.pureTaskTime,1)*0.25)*100;
}

function buildActions(cur, tgt) {
  const actions = [];
  const deltas = [
    { metric:'Connected Calls', delta: tgt.cc-cur.cc, unit:'/day', target:tgt.cc, weight:0.25, targetVal:T.connectedCalls, dir1:'Increase',dir2:'Reduce' },
    { metric:'AHT First Call',  delta: tgt.aht-cur.aht, unit:'s', target:tgt.aht, weight:0.25, targetVal:T.ahtFirstCall, dir1:'Deepen',dir2:'Streamline' },
    { metric:'Adjusted TTFA',   delta: (tgt.ttfa-cur.ttfa)*100, unit:'%', target:tgt.ttfa*100, weight:0.25, targetVal:T.adjustedTTFA*100, dir1:'Improve',dir2:'N/A' },
    { metric:'Pure Talk Time',  delta: tgt.ptt-cur.ptt, unit:' min', target:tgt.ptt, weight:0.25, targetVal:T.pureTaskTime, dir1:'Extend',dir2:'Focus' },
  ];
  for (const d of deltas) {
    if (Math.abs(d.delta) < 0.3) continue;
    const dir = d.delta > 0 ? d.dir1 : d.dir2;
    const impact = (Math.abs(d.delta)/d.targetVal*d.weight*100).toFixed(1);
    actions.push({ metric:d.metric, action:`${dir} by ${Math.abs(d.delta).toFixed(1)}${d.unit} → target ${d.target.toFixed(1)}${d.unit}`, impact:`+${impact} BSC pts` });
  }
  return actions;
}

function calcQualProb(advisor) {
  const { bscScore, qualification } = advisor;
  const { pdStatus } = qualification || {};
  let p = 50;
  if (pdStatus==='Met') p+=30; else if (pdStatus==='On Track') p+=15; else if (pdStatus==='Off Track') p-=20;
  if (bscScore>=75) p+=20; else if (bscScore>=60) p+=10; else p-=15;
  return Math.min(95, Math.max(5, p));
}

export function generateScenarios(advisor, totalAdvisors=99) {
  const { bscScore, connectedCalls:cc=0, ahtFirstCall:aht=0, adjustedTTFA:ttfa=0, pureTaskTime:ptt=0, productiveDays, region, rank=50 } = advisor;
  const cur = { cc, aht, ttfa, ptt };
  const minPD = getMinProductiveDays(region);
  const remaining = getWorkingDaysRemaining();
  const isEligible = advisor.qualification?.qualified;
  const curPayout = advisor.payout||0;

  // S1: Calls Blitz
  const s1 = { cc:Math.min(cc+4,T.connectedCalls+4), aht:Math.max(aht*0.97,720), ttfa:Math.min(ttfa+0.03,1), ptt:0 };
  s1.ptt = Math.min(s1.cc*(s1.aht/60), T.pureTaskTime+10);
  const s1bsc = calcBSCFromMetrics(s1.cc,s1.aht,s1.ttfa,s1.ptt);
  const s1rank = Math.max(1, rank-Math.round((s1bsc-bscScore)*1.2));

  // S2: Quality Drive
  const s2 = { aht:Math.min(Math.max(aht*1.08,T.ahtFirstCall),T.ahtFirstCall*1.15), cc:Math.max(cc*0.95,T.connectedCalls*0.85), ttfa:Math.min(ttfa+0.02,1), ptt:Math.min(ptt*1.15,T.pureTaskTime*1.1) };
  const s2bsc = calcBSCFromMetrics(s2.cc,s2.aht,s2.ttfa,s2.ptt);
  const s2rank = Math.max(1, rank-Math.round((s2bsc-bscScore)*1.2));

  // S3: Balanced
  const targetBSC = isEligible ? Math.min(bscScore+8,100) : 62;
  const k = Math.min(1+(Math.max(0,targetBSC-bscScore)/100)*0.6, 1.25);
  const s3 = { cc:Math.min(cc*k,T.connectedCalls), aht:Math.min(aht*k,T.ahtFirstCall), ttfa:Math.min(ttfa*k,1), ptt:Math.min(ptt*k,T.pureTaskTime) };
  const s3bsc = calcBSCFromMetrics(s3.cc,s3.aht,s3.ttfa,s3.ptt);
  const s3rank = Math.max(1, rank-Math.round((s3bsc-bscScore)*1.2));

  const makeScenario = (id,label,emoji,color,desc,tgt,projBSC,projRank) => ({
    id, label, emoji, color, description: desc,
    targets:{ connectedCalls:+tgt.cc.toFixed(1), ahtFirstCall:Math.round(tgt.aht), adjustedTTFA:+tgt.ttfa.toFixed(3), pureTaskTime:+tgt.ptt.toFixed(1) },
    projectedBSC:+projBSC.toFixed(2), projectedRank:projRank,
    projectedPayout:getSlabForRank(projRank).payout,
    bscDelta:+(projBSC-bscScore).toFixed(2),
    payoutDelta:getSlabForRank(projRank).payout - curPayout,
    slab:getSlabForRank(projRank).label,
    actions:buildActions(cur,tgt),
  });

  return {
    advisor:advisor.name, empId:advisor.empId,
    currentBSC:+bscScore.toFixed(2), currentRank:rank, currentPayout:curPayout,
    currentSlab:advisor.slab, isEligible,
    productiveDaysNeeded:Math.max(0,minPD-productiveDays),
    remaining, minPD, productiveDays,
    qualificationProbability:calcQualProb(advisor),
    eligibilityMessage: !isEligible
      ? (productiveDays<minPD ? `Needs ${Math.max(0,minPD-productiveDays)} more productive days (${productiveDays}/${minPD})` : `BSC must reach 60 (currently ${bscScore.toFixed(1)})`)
      : `Eligible — focus on slab improvement`,
    scenarios:[
      makeScenario('calls_blitz','Calls Blitz','🚀','#3b82f6','Maximize connect volume — push dials, accept modest AHT', s1, s1bsc, s1rank),
      makeScenario('quality_drive','Quality Drive','🎯','#10b981','Deepen call quality — higher AHT & PTT, fewer but better connects', s2, s2bsc, s2rank),
      makeScenario('balanced','Balanced Climb','⚖️','#f59e0b','Steady equal improvement across all 4 metrics — safest path', s3, s3bsc, s3rank),
    ],
  };
}

export function calcEffortScore(dials, connectRate, pttMins) {
  const dPct = Math.min((dials||0)/100,1)*100;
  const cPct = Math.min((connectRate||0)/0.25,1)*100;
  const pPct = Math.min((pttMins||0)/T.pureTaskTime,1)*100;
  return Math.min(100, Math.round(dPct*0.30 + cPct*0.30 + pPct*0.40));
}
