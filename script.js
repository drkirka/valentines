const YT_URL="https://youtu.be/5T5BY1j2MkE";
const video=document.getElementById("video");
const canvas=document.getElementById("canvas");
const ctx=canvas?.getContext?.("2d");
const titleEl=document.getElementById("title");
const subtitleEl=document.getElementById("subtitle");
const bigNumberEl=document.getElementById("bigNumber");
const card=document.getElementById("card");
const cardImg=document.getElementById("cardImg");
const cardText=document.getElementById("cardText");
const snapWrap=document.getElementById("snapWrap");
const snapText=document.getElementById("snapText");
const snapImg=document.getElementById("snapImg");
const holdBox=document.getElementById("hold");
const holdLabel=document.getElementById("holdLabel");
const holdFill=document.getElementById("holdFill");
const startOverlay=document.getElementById("startOverlay");
const startBtn=document.getElementById("startBtn");
const overlayText=document.getElementById("overlayText");

if(!video||!canvas||!ctx||!titleEl||!subtitleEl||!bigNumberEl){
  throw new Error("Missing required HTML elements.");
}

video.setAttribute("playsinline","true");
video.setAttribute("webkit-playsinline","true");
video.muted=true;
video.style.pointerEvents="none";
video.style.position="fixed";
video.style.left="-9999px";
video.style.top="0";
video.style.width="1px";
video.style.height="1px";
video.style.opacity="0.001";

const FACE_GRACE_MS=700;
const HOLD_SMILE_MS=14000;
const HOLD_THUMB_MS=5000;
const JOY_SMOOTH_N=8;
const CALIB_MS=2000;
const COUNT_STEP_DELAY_MS=700;
const SEND_EVERY_MS=45;

const ASSETS={
  countdownImg:"",
  valentineImg:"",
  yayImg:""
};

const Scene={
  HELLO:"HELLO",
  CALIB:"CALIB",
  EMO:"EMO",
  SMILE_HOLD:"SMILE_HOLD",
  IMPORTANT:"IMPORTANT",
  COUNTDOWN:"COUNTDOWN",
  FIST:"FIST",
  VALENTINE:"VALENTINE",
  THUMB_PROMPT:"THUMB_PROMPT",
  YAY:"YAY"
};

let scene=Scene.HELLO;
let expected=5;
let locked=false;
let started=false;
let lastFaceSeenAt=0;
let lastCountAt=0;
let smileHoldStart=0;
let holdGesture=null;
let holdStart=0;
let lastJoy=0;
let joyBuf=[];
let calibStart=0;
let renderRAF=0;
let mediaPipeRAF=0;
let floaterTimer=null;

let neutralCalib={
  startedAt:0,
  done:false,
  mouthWNorm:0,
  cornerLift:0
};

function resetNeutralCalib(){
  neutralCalib={
    startedAt:0,
    done:false,
    mouthWNorm:0,
    cornerLift:0
  };
}

function spawnFloater(){
  const el=document.createElement("div");
  el.className="floater";
  el.textContent=Math.random()<0.55?"💖":"🐱";
  el.style.left=Math.random()*100+"vw";
  el.style.top=95+Math.random()*10+"vh";
  el.style.fontSize=22+Math.random()*18+"px";
  el.style.animationDuration=5.8+Math.random()*2.6+"s";
  document.body.appendChild(el);
  el.addEventListener("animationend",()=>el.remove());
  setTimeout(()=>el.remove(),9000);
}

function startFloaters(){
  if(floaterTimer)return;
  for(let i=0;i<8;i++){
    setTimeout(spawnFloater,i*180);
  }
  floaterTimer=setInterval(()=>{
    spawnFloater();
    if(Math.random()<0.5){
      setTimeout(spawnFloater,220);
    }
  },550);
}

let ytBtn=null;

function ensureYTButton(){
  if(ytBtn)return ytBtn;
  ytBtn=document.createElement("button");
  ytBtn.type="button";
  ytBtn.textContent="Watch video 💖";
  ytBtn.className="ytBtn";
  ytBtn.addEventListener("click",()=>{
    const w=window.open(YT_URL,"_blank","noopener,noreferrer");
    if(!w){
      window.location.href=YT_URL;
    }
  });
  document.body.appendChild(ytBtn);
  return ytBtn;
}

function showYTButton(){
  if(!YT_URL)return;
  ensureYTButton().style.display="block";
}

function hideYTButton(){
  if(ytBtn){
    ytBtn.style.display="none";
  }
}

function showCard(img,text){
  if(!card)return;
  card.classList.remove("hidden");
  if(cardImg){
    if(img){
      cardImg.src=img;
      cardImg.style.display="block";
    }else{
      cardImg.removeAttribute("src");
      cardImg.style.display="none";
    }
  }
  if(cardText){
    cardText.textContent=text||"";
  }
}

function hideCard(){
  if(card){
    card.classList.add("hidden");
  }
}

function showSnap(dataUrl){
  if(!snapWrap||!snapImg||!dataUrl)return;
  snapWrap.classList.remove("hidden");
  snapImg.src=dataUrl;
}

function hideSnap(){
  if(!snapWrap||!snapImg)return;
  snapWrap.classList.add("hidden");
  snapImg.removeAttribute("src");
}

function resetHold(){
  holdGesture=null;
  holdStart=0;
  if(holdFill){
    holdFill.style.width="0%";
    holdFill.style.background="linear-gradient(90deg, #ff4d6d, #ffd166, #06d6a0, #4d96ff)";
  }
  if(holdLabel){
    holdLabel.textContent="Hold…";
  }
  if(holdBox){
    holdBox.classList.add("hidden");
  }
}

function updateHoldUI(label,pct){
  if(!holdBox||!holdFill||!holdLabel)return;
  const clamped=Math.max(0,Math.min(100,pct));
  holdBox.classList.remove("hidden");
  holdLabel.textContent=label;
  holdFill.style.width=`${clamped}%`;
  holdFill.style.background="linear-gradient(90deg, #ff4d6d, #ffd166, #06d6a0, #4d96ff)";
}

function setHelloUI(){
  titleEl.textContent="Hi! 👋";
  subtitleEl.textContent="";
  bigNumberEl.classList.add("hidden");
  hideCard();
  hideSnap();
  resetHold();
  hideYTButton();
}

function setCalibUI(pct=0){
  titleEl.textContent="One second…";
  subtitleEl.textContent="Keep your face in the frame and do NOT smile 🙂 Calibrating…";
  bigNumberEl.classList.add("hidden");
  hideCard();
  hideSnap();
  updateHoldUI("Calibrating neutral face…",pct);
}

function setEmoUI(){
  titleEl.textContent="Reading emotion…";
  subtitleEl.textContent="Almost ready 🙂";
  bigNumberEl.classList.add("hidden");
  hideCard();
  hideSnap();
  resetHold();
}

function setSmileHoldUI(){
  titleEl.textContent="Smile 😄 why are you glowing like that...";
  subtitleEl.textContent=`Happiness level: ${Math.round(lastJoy)}%`;
  bigNumberEl.classList.add("hidden");
  hideCard();
}

function setImportantUI(){
  titleEl.textContent="Why? 😳";
  subtitleEl.textContent="I have an important question for you…";
  bigNumberEl.classList.add("hidden");
  hideCard();
  resetHold();
}

function setCountdownUI(){
  titleEl.textContent="Can you count backwards?!";
  subtitleEl.textContent="Show the numbers 5 → 1 with your lovely fingers";
  bigNumberEl.classList.remove("hidden");
  bigNumberEl.textContent=String(expected);
  resetHold();
  hideSnap();
  if(ASSETS.countdownImg){
    showCard(ASSETS.countdownImg,"");
  }else{
    hideCard();
  }
}

function setFistUI(){
  titleEl.textContent="Fiiist! power move";
  subtitleEl.textContent="Make a fist ✊ (0 fingers please)";
  bigNumberEl.classList.remove("hidden");
  bigNumberEl.textContent="✊";
  resetHold();
}

function setValentineUI(){
  titleEl.textContent="💘";
  subtitleEl.textContent="";
  bigNumberEl.classList.add("hidden");
  resetHold();
  if(ASSETS.valentineImg){
    showCard(ASSETS.valentineImg,"Will you be my valentine???????");
  }else{
    showCard("","Will you be my valentine????");
  }
}

function setThumbUI(){
  titleEl.textContent="💘";
  subtitleEl.textContent="Show 👍 or 👎 and hold it";
  bigNumberEl.classList.add("hidden");
  resetHold();
}

function setYayUI({keepSnapshot=false}={}){
  titleEl.textContent="YAAAY 🎉";
  subtitleEl.textContent="love you I LOVE YOU love you I LOVE YOUUU love you!!!";
  bigNumberEl.classList.add("hidden");
  resetHold();
  if(!keepSnapshot){
    hideSnap();
  }
  if(ASSETS.yayImg){
    showCard(ASSETS.yayImg,"💖💖💖");
  }else{
    showCard("","💖💖💖");
  }
  fireConfetti();
  showYTButton();
}

function fireConfetti(){
  const EM=["🎉","💖","✨","🥳"];
  for(let i=0;i<22;i++){
    const el=document.createElement("div");
    el.textContent=EM[Math.floor(Math.random()*EM.length)];
    el.style.position="fixed";
    el.style.left=Math.random()*100+"vw";
    el.style.top="-12vh";
    el.style.fontSize=18+Math.random()*22+"px";
    el.style.transition="transform 1.6s linear, top 1.6s linear, opacity 1.6s linear";
    el.style.zIndex="9999";
    el.style.pointerEvents="none";
    document.body.appendChild(el);
    requestAnimationFrame(()=>{
      el.style.top="110vh";
      el.style.transform=`translateX(${(Math.random()*2-1)*140}px) rotate(${Math.random()*720}deg)`;
      el.style.opacity="0";
    });
    setTimeout(()=>el.remove(),1700);
  }
}

function countFingers(lm){
  let count=0;
  [8,12,16,20].forEach((tip)=>{
    if(lm[tip].y<lm[tip-2].y){
      count++;
    }
  });
  if(Math.abs(lm[4].x-lm[3].x)>0.04){
    count++;
  }
  return Math.max(0,Math.min(5,count));
}

function detectThumb(lm){
  const wrist=lm[0];
  const thumbTip=lm[4];
  const thumbBase=lm[2];
  const thumbLen=Math.hypot(thumbTip.x-thumbBase.x,thumbTip.y-thumbBase.y);
  if(thumbLen<0.12)return null;
  const threshold=Math.max(0.05,Math.min(0.10,thumbLen*0.6));
  const deltaY=thumbTip.y-wrist.y;
  if(deltaY<-threshold)return "UP";
  if(deltaY>threshold)return "DOWN";
  return null;
}

function snapshot180(){
  const w=canvas.width;
  const h=canvas.height;
  if(!w||!h)return "";
  const temp=document.createElement("canvas");
  temp.width=w;
  temp.height=h;
  const tctx=temp.getContext("2d");
  if(!tctx)return "";
  tctx.translate(w/2,h/2);
  tctx.rotate(Math.PI);
  tctx.drawImage(canvas,-w/2,-h/2,w,h);
  return temp.toDataURL("image/png");
}

function dist(a,b){
  return Math.hypot(a.x-b.x,a.y-b.y);
}

function calcSmilePercent(faceLm){
  const L=faceLm[61];
  const R=faceLm[291];
  const U=faceLm[13];
  const D=faceLm[14];
  const E1=faceLm[33];
  const E2=faceLm[263];
  const eyeDist=dist(E1,E2)+1e-6;
  const mouthWNorm=dist(L,R)/eyeDist;
  const midY=(U.y+D.y)/2;
  const cornersY=(L.y+R.y)/2;
  const cornerLift=midY-cornersY;
  const baseW=neutralCalib.mouthWNorm||mouthWNorm;
  const baseLift=neutralCalib.cornerLift||cornerLift;
  const wDelta=mouthWNorm-baseW;
  const liftDelta=cornerLift-baseLift;
  const liftScore=(liftDelta-0.002)/0.018;
  const widthScore=(wDelta-0.006)/0.040;
  const score=0.65*liftScore+0.35*widthScore;
  return Math.max(0,Math.min(1,score))*100;
}

function smoothJoy(v){
  joyBuf.push(v);
  if(joyBuf.length>JOY_SMOOTH_N){
    joyBuf.shift();
  }
  lastJoy=joyBuf.reduce((a,b)=>a+b,0)/joyBuf.length;
  return lastJoy;
}

if(typeof Hands==="undefined"){
  throw new Error("Hands not loaded. Check MediaPipe script order in index.html.");
}

if(typeof FaceMesh==="undefined"){
  throw new Error("FaceMesh not loaded. Check MediaPipe script order in index.html.");
}

const canDraw=typeof drawConnectors!=="undefined"&&typeof drawLandmarks!=="undefined"&&typeof HAND_CONNECTIONS!=="undefined";

const hands=new Hands({
  locateFile:(file)=>`https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
  maxNumHands:1,
  modelComplexity:0,
  minDetectionConfidence:0.5,
  minTrackingConfidence:0.5
});

const faceMesh=new FaceMesh({
  locateFile:(file)=>`https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});

faceMesh.setOptions({
  maxNumFaces:1,
  refineLandmarks:false,
  selfieMode:false,
  minDetectionConfidence:0.3,
  minTrackingConfidence:0.3
});

let lastHandResults=null;
let lastFaceResults=null;
let gotFirstFace=false;
let gotFirstHand=false;

hands.onResults((res)=>{
  lastHandResults=res;
  if(res?.multiHandLandmarks?.[0]){
    gotFirstHand=true;
  }
});

faceMesh.onResults((res)=>{
  lastFaceResults=res;
  if(res?.multiFaceLandmarks?.[0]){
    gotFirstFace=true;
  }
});

let finalHeartsActive=false;
let ringVideo=null;
let ringSnap=null;
let eyeL=null;
let eyeR=null;
let ringFollowRAF=0;

function createHeartEye(){
  const el=document.createElement("div");
  el.className="heart-eye";
  el.textContent="💖";
  document.body.appendChild(el);
  return el;
}

function updateEyeHearts(faceLm){
  if(!finalHeartsActive)return;
  if(!eyeL)eyeL=createHeartEye();
  if(!eyeR)eyeR=createHeartEye();
  if(!faceLm){
    eyeL.style.opacity="0";
    eyeR.style.opacity="0";
    return;
  }
  const l=faceLm[33];
  const r=faceLm[263];
  const rect=canvas.getBoundingClientRect();
  eyeL.style.opacity="0.98";
  eyeR.style.opacity="0.98";
  eyeL.style.left=`${rect.left+l.x*rect.width}px`;
  eyeL.style.top=`${rect.top+l.y*rect.height}px`;
  eyeR.style.left=`${rect.left+r.x*rect.width}px`;
  eyeR.style.top=`${rect.top+r.y*rect.height}px`;
}

function createHeartRingAroundElement(targetEl,{count=44,padding=26,spin=true}={}){
  if(!targetEl)return null;
  const ring=document.createElement("div");
  ring.className="heart-ring"+(spin?" spin":"");
  ring._targetEl=targetEl;
  ring._padding=padding;
  for(let i=0;i<count;i++){
    const a=(i/count)*Math.PI*2;
    const item=document.createElement("div");
    item.className="heart-item";
    item.dataset.a=String(a);
    const sp=document.createElement("span");
    sp.textContent=Math.random()<0.85?"💖":"💘";
    sp.style.fontSize=14+Math.random()*16+"px";
    sp.style.animationDuration=0.85+Math.random()*0.9+"s";
    sp.style.animationDelay=Math.random()*0.5+"s";
    item.appendChild(sp);
    ring.appendChild(item);
  }
  document.body.appendChild(ring);
  layoutHeartRing(ring);
  return ring;
}

function layoutHeartRing(ring){
  if(!ring||!ring._targetEl)return;
  const rect=ring._targetEl.getBoundingClientRect();
  const cx=rect.left+rect.width/2;
  const cy=rect.top+rect.height/2;
  const radius=Math.max(rect.width,rect.height)/2+(ring._padding??26);
  const items=ring.querySelectorAll(".heart-item");
  const count=items.length||1;
  ring.style.left=`${cx}px`;
  ring.style.top=`${cy}px`;
  items.forEach((item,i)=>{
    const a=Number(item.dataset.a??(i/count)*Math.PI*2);
    const jitter=Math.random()*8-4;
    const r=radius+jitter;
    item.style.transform=`translate(-50%, -50%) rotate(${a}rad) translate(${r}px) rotate(${-a}rad)`;
  });
}

function startRingsFollowLoop(){
  if(ringFollowRAF)return;
  const tick=()=>{
    ringFollowRAF=requestAnimationFrame(tick);
    if(!finalHeartsActive)return;
    if(ringVideo)layoutHeartRing(ringVideo);
    if(ringSnap)layoutHeartRing(ringSnap);
  };
  ringFollowRAF=requestAnimationFrame(tick);
}

function killFinalHearts(){
  finalHeartsActive=false;
  if(ringFollowRAF){
    cancelAnimationFrame(ringFollowRAF);
    ringFollowRAF=0;
  }
  if(ringVideo){
    ringVideo.remove();
    ringVideo=null;
  }
  if(ringSnap){
    ringSnap.remove();
    ringSnap=null;
  }
  if(eyeL){
    eyeL.remove();
    eyeL=null;
  }
  if(eyeR){
    eyeR.remove();
    eyeR=null;
  }
}

function startFinalHearts({withSnap=false}={}){
  killFinalHearts();
  finalHeartsActive=true;
  ringVideo=createHeartRingAroundElement(canvas,{
    count:64,
    padding:30,
    spin:true
  });
  if(withSnap&&snapImg){
    ringSnap=createHeartRingAroundElement(snapImg,{
      count:54,
      padding:24,
      spin:true
    });
  }
  startRingsFollowLoop();
}

const TAP_EMOJIS=["🐹","🐹","🐾","✨","💖"];
const TAP_TEXTS=["52!","tap tap tap!","dummy","who read this is silly","💘"];

function spawnHamster(x,y){
  const el=document.createElement("div");
  el.className="tap-hamster";
  el.style.left=x+"px";
  el.style.top=y+"px";
  const emoji=document.createElement("div");
  emoji.textContent=TAP_EMOJIS[Math.floor(Math.random()*TAP_EMOJIS.length)];
  emoji.style.fontSize=26+Math.random()*18+"px";
  const txt=document.createElement("div");
  txt.className="t";
  txt.textContent=TAP_TEXTS[Math.floor(Math.random()*TAP_TEXTS.length)];
  txt.style.marginTop="4px";
  el.appendChild(emoji);
  el.appendChild(txt);
  document.body.appendChild(el);
  el.addEventListener("animationend",()=>el.remove());
  setTimeout(()=>el.remove(),1200);
}

function burstHamsters(x,y){
  const n=3+Math.floor(Math.random()*3);
  for(let i=0;i<n;i++){
    const dx=(Math.random()*2-1)*26;
    const dy=(Math.random()*2-1)*20;
    setTimeout(()=>{
      spawnHamster(x+dx,y+dy);
    },i*45);
  }
}

document.body.addEventListener("pointerdown",(e)=>{
  if(e.isPrimary===false)return;
  burstHamsters(e.clientX,e.clientY);
},{passive:true});

function renderAndLogic(){
  if(video.readyState>=2&&video.videoWidth>0){
    if(canvas.width!==video.videoWidth||canvas.height!==video.videoHeight){
      canvas.width=video.videoWidth||1280;
      canvas.height=video.videoHeight||720;
    }
    ctx.drawImage(video,0,0,canvas.width,canvas.height);
  }
  const now=performance.now();
  const faceLm=lastFaceResults?.multiFaceLandmarks?.[0]||null;
  const handLm=lastHandResults?.multiHandLandmarks?.[0]||null;
  if(faceLm){
    lastFaceSeenAt=now;
  }
  const faceRecently=now-lastFaceSeenAt<=FACE_GRACE_MS;
  if(finalHeartsActive){
    updateEyeHearts(faceLm);
  }
  if(handLm&&canDraw){
    try{
      drawConnectors(ctx,handLm,HAND_CONNECTIONS,{lineWidth:3});
      drawLandmarks(ctx,handLm,{lineWidth:2});
    }catch(e){
      console.warn("Could not draw hand landmarks:",e);
    }
  }

  if(scene===Scene.HELLO&&!locked){
    locked=true;
    setHelloUI();
    setTimeout(()=>{
      scene=Scene.CALIB;
      locked=false;
      calibStart=0;
      resetNeutralCalib();
      setCalibUI(0);
    },900);
  }

  if(scene===Scene.CALIB&&!locked){
    if(!faceLm&&!faceRecently){
      calibStart=0;
      setCalibUI(0);
    }else if(faceLm){
      if(!calibStart)calibStart=now;
      const a=0.15;
      const L=faceLm[61];
      const R=faceLm[291];
      const U=faceLm[13];
      const D=faceLm[14];
      const E1=faceLm[33];
      const E2=faceLm[263];
      const eyeDist=dist(E1,E2)+1e-6;
      const mouthWNorm=dist(L,R)/eyeDist;
      const midY=(U.y+D.y)/2;
      const cornersY=(L.y+R.y)/2;
      const cornerLift=midY-cornersY;
      if(!neutralCalib.startedAt){
        neutralCalib.startedAt=now;
        neutralCalib.mouthWNorm=mouthWNorm;
        neutralCalib.cornerLift=cornerLift;
      }else{
        neutralCalib.mouthWNorm=neutralCalib.mouthWNorm*(1-a)+mouthWNorm*a;
        neutralCalib.cornerLift=neutralCalib.cornerLift*(1-a)+cornerLift*a;
      }
      const elapsed=now-calibStart;
      setCalibUI((elapsed/CALIB_MS)*100);
      if(elapsed>=CALIB_MS){
        neutralCalib.done=true;
        scene=Scene.EMO;
        locked=false;
        setEmoUI();
      }
    }
  }

  if(scene===Scene.EMO&&!locked){
    locked=true;
    setTimeout(()=>{
      scene=Scene.SMILE_HOLD;
      smileHoldStart=0;
      locked=false;
      setSmileHoldUI();
    },900);
  }

  if(scene===Scene.SMILE_HOLD&&!locked){
    if(faceLm){
      smoothJoy(calcSmilePercent(faceLm));
    }
    setSmileHoldUI();
    if(!faceLm&&!faceRecently){
      updateHoldUI("Move your face closer 🙂",0);
      smileHoldStart=0;
    }else{
      const smiling=lastJoy>=20;
      if(!smiling){
        smileHoldStart=0;
        updateHoldUI("Smile 😄",0);
      }else{
        if(!smileHoldStart)smileHoldStart=now;
        const elapsed=now-smileHoldStart;
        updateHoldUI("Hold the smile 😄",(elapsed/HOLD_SMILE_MS)*100);
        if(elapsed>=HOLD_SMILE_MS){
          locked=true;
          if(holdBox){
            holdBox.classList.add("hidden");
          }
          scene=Scene.IMPORTANT;
          setImportantUI();
          setTimeout(()=>{
            scene=Scene.COUNTDOWN;
            expected=5;
            lastCountAt=0;
            locked=false;
            setCountdownUI();
          },1700);
        }
      }
    }
  }

  if(handLm&&!locked){
    if(scene===Scene.COUNTDOWN){
      const fingers=countFingers(handLm);
      if(fingers===expected&&now-lastCountAt>=COUNT_STEP_DELAY_MS){
        lastCountAt=now;
        expected--;
        if(expected>=1){
          bigNumberEl.textContent=String(expected);
        }else{
          scene=Scene.FIST;
          setFistUI();
        }
      }
    }

    if(scene===Scene.FIST){
      const fingers=countFingers(handLm);
      if(fingers===0){
        scene=Scene.VALENTINE;
        setValentineUI();
        locked=true;
        setTimeout(()=>{
          scene=Scene.THUMB_PROMPT;
          setThumbUI();
          locked=false;
        },1100);
      }
    }

    if(scene===Scene.THUMB_PROMPT){
      const t=detectThumb(handLm);
      if(!t){
        if(holdGesture!==null)resetHold();
      }else if(t!==holdGesture){
        holdGesture=t;
        holdStart=now;
        updateHoldUI(t==="UP"?"Hold 👍":"Hold 👎",0);
      }else{
        const elapsed=now-holdStart;
        updateHoldUI(t==="UP"?"Hold 👍":"Hold 👎",(elapsed/HOLD_THUMB_MS)*100);
        if(elapsed>=HOLD_THUMB_MS){
          locked=true;
          if(holdBox){
            holdBox.classList.add("hidden");
          }
          if(t==="UP"){
            scene=Scene.YAY;
            setYayUI({keepSnapshot:false});
            startFinalHearts({withSnap:false});
          }else{
            const img180=snapshot180();
            if(snapText){
              snapText.textContent="Can't tell top from bottom, huh?";
            }
            showSnap(img180);
            scene=Scene.YAY;
            setYayUI({keepSnapshot:true});
            startFinalHearts({withSnap:true});
          }
        }
      }
    }
  }else if(scene===Scene.THUMB_PROMPT&&holdGesture!==null){
    resetHold();
  }

  renderRAF=requestAnimationFrame(renderAndLogic);
}

async function startCameraAndPipeline(){
  const stream=await navigator.mediaDevices.getUserMedia({
    audio:false,
    video:{
      facingMode:"user",
      width:{ideal:1280},
      height:{ideal:720}
    }
  });
  video.srcObject=stream;
  await video.play();
  const t0=performance.now();
  while(video.videoWidth===0&&performance.now()-t0<2000){
    await new Promise((r)=>requestAnimationFrame(r));
  }
  let lastSendAt=0;
  async function mediaPipeLoop(){
    if(video.readyState>=2&&video.videoWidth>0){
      const now=performance.now();
      if(now-lastSendAt>=SEND_EVERY_MS){
        lastSendAt=now;
        try{
          await faceMesh.send({image:video});
          await hands.send({image:video});
        }catch(e){
          console.warn("MediaPipe send failed:",e);
        }
      }
    }
    mediaPipeRAF=requestAnimationFrame(mediaPipeLoop);
  }
  if(!mediaPipeRAF){
    mediaPipeLoop();
  }
}

function resetAppState(){
  joyBuf=[];
  lastJoy=0;
  calibStart=0;
  expected=5;
  lastCountAt=0;
  locked=false;
  holdGesture=null;
  holdStart=0;
  smileHoldStart=0;
  scene=Scene.HELLO;
  gotFirstFace=false;
  gotFirstHand=false;
  resetNeutralCalib();
  resetHold();
  killFinalHearts();
}

startBtn?.addEventListener("click",async()=>{
  if(started)return;
  started=true;
  resetAppState();
  startFloaters();
  if(startBtn)startBtn.disabled=true;
  if(overlayText)overlayText.textContent="Loading... wait a bit :P";
  try{
    await startCameraAndPipeline();
    const t0=performance.now();
    await new Promise((resolve)=>{
      const tick=()=>{
        const ok=gotFirstFace||gotFirstHand;
        const timeout=performance.now()-t0>3500;
        if(ok||timeout){
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
    if(startOverlay){
      startOverlay.style.display="none";
    }
    setHelloUI();
    if(!renderRAF){
      renderAndLogic();
    }
  }catch(e){
    console.error("Camera start failed:",e);
    if(startBtn)startBtn.disabled=false;
    if(overlayText){
      overlayText.textContent="Could not start the camera 😭 Check browser permissions.";
    }
    started=false;
  }
});

setHelloUI();
