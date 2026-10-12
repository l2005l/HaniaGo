(function(){
'use strict';
var W=720,H=1280,FPS=30,MAX=80,X=0.6;
var SEA='#0B7A8C',SUN='#F2B01E',INK='#12303A',PAPER='#EEF4F5';
var TRACKS=[
 ['שמח וקליל',[['ukulele','Happy Whistling Ukulele',''],['ukulele2','Ukulele Song',''],['funshine','Funshine','Kevin MacLeod'],['sun','Adding the Sun','Kevin MacLeod'],['city','City Sunshine','Kevin MacLeod'],['family','Fancy Family','Rafael Krux'],['tarantella','Village Tarantella','Kevin MacLeod']]],
 ['הרפתקה',[['notebook','Travelers Notebook',''],['north','Trip Up North','Bryan Teoh'],['hopeful','Hopeful','Rafael Krux'],['celebrate','Celebration','Alexander Nakarada']]],
 ['רגוע',[['piano','Lovely Piano Song',''],['sunflower','Champ de tournesol','Komiku']]],
 ['ים וחופשה',[['rasta','Sunny Rasta','Alexander Nakarada'],['pinacolada','Piña Colada','Alexander Nakarada']]],
 ['אווירה מקומית',[['venice','Night in Venice','Kevin MacLeod · איטליה'],['baguette','Le Baguette','Alexander Nakarada · צרפת']]]];
var $=function(id){return document.getElementById(id)};
var fromShare=false,photos=[],story=null,track='ukulele',buffers={},actx=null,previewSrc=null,previewId='',busy=false;
function ev(e){try{fetch('/api/ev',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({e:e}),keepalive:true}).catch(function(){})}catch(x){}}
function esc(t){return String(t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}

// ---------- reading photos: date and location from EXIF ----------
function exif(buf){
  var out={time:0,lat:null,lng:null,gps:0};
  try{var v=new DataView(buf);if(v.getUint16(0)!==0xFFD8)return out;var o=2;
    while(o<v.byteLength-4){var m=v.getUint16(o);
      if(m===0xFFE1&&v.getUint32(o+4)===0x45786966){var s=o+10,le=v.getUint16(s)===0x4949;
        var g16=function(p){return v.getUint16(p,le)},g32=function(p){return v.getUint32(p,le)};
        var str=function(p,n){var r='';for(var i=0;i<n;i++){var c=v.getUint8(p+i);if(!c)break;r+=String.fromCharCode(c)}return r};
        var find=function(p,want){var n=g16(s+p);for(var i=0;i<n;i++){var e=s+p+2+i*12;if(g16(e)===want)return e}return 0};
        var rat=function(p){var d=g32(p+4);return d?g32(p)/d:0};
        var ifd0=g32(s+4),dt='',e=find(ifd0,0x8769);
        if(e){var e2=find(g32(e+8),0x9003);if(e2)dt=str(s+g32(e2+8),19)}
        if(!dt){var e3=find(ifd0,0x0132);if(e3)dt=str(s+g32(e3+8),19)}
        var mm=/^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d)/.exec(dt);if(mm)out.time=new Date(+mm[1],mm[2]-1,+mm[3],+mm[4],+mm[5]).getTime();
        var gp=find(ifd0,0x8825);
        if(gp){out.gps=1;var gi=g32(gp+8),la=find(gi,2),lo=find(gi,4),lr=find(gi,1),lor=find(gi,3);
          if(la&&lo){var dm=function(e){var p=s+g32(e+8);return rat(p)+rat(p+8)/60+rat(p+16)/3600};
            var a=dm(la),b=dm(lo);if(lr&&String.fromCharCode(v.getUint8(lr+8))==='S')a=-a;if(lor&&String.fromCharCode(v.getUint8(lor+8))==='W')b=-b;
            if((a||b)&&Math.abs(a)<=90&&Math.abs(b)<=180){out.lat=a;out.lng=b}}}
        return out}
      if((m&0xFF00)!==0xFF00)return out;o+=2+v.getUint16(o+2)}
  }catch(e){}return out}
function shrink(src,w,h){var k=Math.min(1,1280/Math.max(w,h)),c=document.createElement('canvas');c.width=Math.round(w*k);c.height=Math.round(h*k);c.getContext('2d').drawImage(src,0,0,c.width,c.height);return c}
async function loadFile(f){
  var meta=exif(await f.slice(0,262144).arrayBuffer());
  var bmp=await createImageBitmap(f);var c=shrink(bmp,bmp.width,bmp.height);if(bmp.close)bmp.close();
  return {img:c,time:meta.time,lat:meta.lat,lng:meta.lng,gps:meta.gps,order:f.lastModified||0}}
async function onFiles(list){
  var fs=[].slice.call(list||[]).filter(function(f){return /^image\//.test(f.type)||/\.(jpe?g|png|heic|heif)$/i.test(f.name)});if(!fs.length)return;
  diag('טוען '+fs.length+' תמונות…');photos=[];$('thumbs').innerHTML='';$('storysec').hidden=true;$('make').disabled=true;
  for(var i=0;i<fs.length;i++){try{photos.push(await loadFile(fs[i]))}catch(err){}if(i%5===4)diag('טוען תמונות… '+(i+1)+'/'+fs.length)}
  if(!photos.length){diag('<span class="err">לא הצלחתי לפתוח את התמונות. נסו לבחור קבצי JPG.</span>');return}
  build(fs.length)}
$('files').addEventListener('change',function(e){fromShare=false;onFiles(e.target.files);e.target.value=''});
(async function shared(){var q=new URLSearchParams(location.search),n=q.get('shared');if(!n)return;
  try{history.replaceState(null,'',location.pathname)}catch(e){}
  if(n==='lost'){diag('<span class="err">התמונות ששיתפתם לא נשמרו. פתחו את HaniaGo פעם אחת מהמסך הראשי ונסו לשתף שוב.</span>');return}
  try{var c=await caches.open('haniago-shared'),ks=await c.keys(),fs=[];
    for(var i=0;i<ks.length;i++){var r=await c.match(ks[i]);if(!r)continue;var b=await r.blob();
      fs.push(new File([b],decodeURIComponent(r.headers.get('x-name')||'photo.jpg'),{type:b.type||'image/jpeg',lastModified:+(r.headers.get('x-modified')||0)||Date.now()}))}
    await caches.delete('haniago-shared');
    if(fs.length){fromShare=true;onFiles(fs)}else diag('<span class="err">לא הגיעו תמונות מהשיתוף. נסו שוב.</span>')}
  catch(e){diag('<span class="err">לא הצלחתי לקרוא את התמונות ששיתפתם.</span>')}})();
function diag(h){$('diag').hidden=false;$('diag').innerHTML=h}

// ---------- demo: a family trip to Rome, including the way there and back ----------
var DEMO=[[32.0052,34.8851,'2026-11-15 05:40'],[32.0049,34.8862,'2026-11-15 06:05'],
 [41.8902,12.4922,'2026-11-15 14:10'],[41.8905,12.4927,'2026-11-15 14:40'],[41.8925,12.4853,'2026-11-15 16:00'],[41.9009,12.4833,'2026-11-15 18:20'],
 [41.9065,12.4536,'2026-11-16 09:30'],[41.9067,12.4540,'2026-11-16 10:15'],[41.9031,12.4663,'2026-11-16 13:00'],[41.8992,12.4731,'2026-11-16 17:30'],
 [41.9128,12.4852,'2026-11-17 10:00'],[41.9060,12.4828,'2026-11-17 13:30'],[41.8897,12.4694,'2026-11-17 19:00'],
 [41.7999,12.2462,'2026-11-18 11:20']];
$('demo').addEventListener('click',function(){
  photos=DEMO.map(function(d,i){var t=d[2].split(/[- :]/);return {img:demoImg(i),time:new Date(+t[0],t[1]-1,+t[2],+t[3],+t[4]).getTime(),lat:d[0],lng:d[1],order:i}});
  $('thumbs').innerHTML='';build(photos.length,true)});
function demoImg(i){
  var c=document.createElement('canvas');c.width=960;c.height=1280;var x=c.getContext('2d');
  var hues=[200,28,340,180,45,260,15,190,320,95,210,35,0,170],h=hues[i%hues.length];
  var g=x.createLinearGradient(0,0,0,1280);g.addColorStop(0,'hsl('+h+',70%,72%)');g.addColorStop(1,'hsl('+((h+40)%360)+',60%,88%)');x.fillStyle=g;x.fillRect(0,0,960,1280);
  x.fillStyle='hsla(45,100%,70%,.9)';x.beginPath();x.arc(700-i*23%300,300+(i*37)%160,100,0,7);x.fill();
  for(var L=0;L<3;L++){x.fillStyle='hsl('+((h+150+L*20)%360)+','+(35+L*10)+'%,'+(55-L*13)+'%)';x.beginPath();x.moveTo(0,800+L*125);
    for(var px=0;px<=960;px+=60)x.lineTo(px,770+L*135+Math.sin(px/170+i+L*2)*55);x.lineTo(960,1280);x.lineTo(0,1280);x.fill()}
  x.fillStyle='hsl('+((h+190)%360)+',25%,22%)';
  for(var b=0;b<7;b++){var bw=80+(b*53+i*31)%80,bh=140+(b*97+i*41)%280,bx=b*140+(i*17)%60;x.fillRect(bx,1050-bh,bw,bh+300);
    x.fillStyle='hsla(48,100%,75%,.85)';for(var wy=1070-bh;wy<1020;wy+=42)for(var wx=bx+12;wx<bx+bw-18;wx+=30)if((wx+wy+i)%3)x.fillRect(wx,wy,12,18);x.fillStyle='hsl('+((h+190)%360)+',25%,22%)'}
  x.fillStyle='rgba(255,255,255,.85)';x.font='700 48px Rubik, Assistant, sans-serif';x.textAlign='center';x.fillText('תמונה לדוגמה '+(i+1),480,150);
  return c}

// ---------- building the story from the photos ----------
function km(a,b,c,d){var r=Math.PI/180,x=(d-b)*r*Math.cos((a+c)/2*r),y=(c-a)*r;return Math.sqrt(x*x+y*y)*6371}
function dayKey(t){var d=new Date(t);return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2)}
function dm(k){var p=k.split('-');return (+p[2])+'.'+(+p[1])}
var whereCache={};
async function where(la,lo){var k=la.toFixed(3)+','+lo.toFixed(3);if(whereCache[k])return whereCache[k];
  try{var r=await fetch('/api/where?la='+la.toFixed(4)+'&lo='+lo.toFixed(4));var j=r.ok?await r.json():{found:false};whereCache[k]=j;return j}catch(e){return {found:false}}}
function span(){var t=photos.filter(function(p){return p.time}).map(function(p){return p.time});if(t.length<2)return '';var d=Math.round((Math.max.apply(0,t)-Math.min.apply(0,t))/864e5);
  return d>14?'<br><b>התמונות מתפרסות על '+d+' ימים.</b> אם זה לא טיול אחד, בחרו רק את התמונות מהטיול.':''}
async function build(picked,demo){
  if(busy)return;busy=true;fromShare=fromShare&&!demo;$('make').disabled=true;
  var timed=photos.filter(function(p){return p.time}).length,geo=photos.filter(function(p){return p.lat!=null}).length;
  photos.sort(function(a,b){return (a.time||8e15)-(b.time||8e15)||a.order-b.order});
  var cut=0;if(photos.length>MAX){cut=photos.length-MAX;var keep=[];for(var i=0;i<MAX;i++)keep.push(photos[Math.floor(i*photos.length/MAX)]);photos=keep}
  thumbs();
  diag((demo?'דוגמה: ':'')+photos.length+' תמונות'+(cut?' (מתוך '+picked+'. נבחרו 80 בפיזור שווה לאורך הטיול)':'')+'<br>תאריך צילום: '+timed+' · מיקום: '+geo+(geo<photos.length&&!demo?' · יש שדה מיקום ריק: '+photos.filter(function(p){return p.gps&&p.lat==null}).length+' · אין שדה מיקום בכלל: '+photos.filter(function(p){return !p.gps}).length:'')+
    (geo<photos.length/2&&!demo?'<br><b>לרוב התמונות אין מיקום.</b> הסרטון ייבנה לפי תאריכי הצילום, ואם שמרתם מסלול ב-HaniaGo, גם לפי המקומות שבו. בטיול הבא כדאי להפעיל שמירת מיקום בהגדרות המצלמה.'+(fromShare?(photos.some(function(p){return p.gps})?' הגלריה הסירה את המיקום: בדקו בהגדרות השיתוף שלה שהאפשרות "הסרת מיקום" כבויה.':' המצלמה לא שמרה מיקום בתמונות האלה.'):' ייתכן שהמצלמה לא שמרה מיקום, או שהטלפון הסיר אותו כי התמונות נבחרו מתוך אתר. שיתוף מהגלריה ל-HaniaGo שומר על המיקום.'):'')+span());
  // 1. places: consecutive photos taken within 400 m on the same day
  var cl=[],cur=null;
  photos.forEach(function(p){var dk=p.time?dayKey(p.time):(cur?cur.day:'');
    var near=cur&&cur.day===dk&&(p.lat==null||cur.la==null||km(cur.la,cur.lo,p.lat,p.lng)<0.4)&&(!p.time||!cur.last||p.time-cur.last<(p.lat==null?75*60e3:4*3600e3));
    if(!near){cur={day:dk,photos:[],la:null,lo:null,n:0,last:0};cl.push(cur)}
    cur.photos.push(p);if(p.time)cur.last=p.time;
    if(p.lat!=null){cur.la=cur.la==null?p.lat:(cur.la*cur.n+p.lat)/(cur.n+1);cur.lo=cur.lo==null?p.lng:(cur.lo*cur.n+p.lng)/(cur.n+1);cur.n++}});
  // 2. names for each place
  var withGeo=cl.filter(function(c){return c.la!=null});
  for(var k=0;k<withGeo.length;k++){diag($('diag').innerHTML.split('<br>זיהוי')[0]+'<br>זיהוי מקומות… '+(k+1)+'/'+withGeo.length);
    var c=withGeo[k],w=await where(c.la,c.lo);c.w=w;
    c.name=w.found?(w.airport?(w.cc==='IL'?'נתב"ג':(w.name||'שדה התעופה')):(w.name||w.city)):'';c.city=w.city||'';c.cc=w.cc||'';c.airport=!!w.airport}
  diag($('diag').innerHTML.split('<br>זיהוי')[0]);
  // 2b. the route saved in HaniaGo: its names for nearby photos, and its places for photos with no location
  var PL=null;try{PL=JSON.parse(localStorage.getItem('haniago_plan')||'null')}catch(e){}
  var guessed=0,inTrip=0;
  if(PL&&PL.date&&PL.days&&!demo){
    var t0=new Date(PL.date+'T12:00:00').getTime(),dIdx=function(k){return k?Math.round((new Date(k+'T12:00:00').getTime()-t0)/864e5):-1};
    var allSt=[];PL.days.forEach(function(st){allSt=allSt.concat(st)});
    cl.forEach(function(c){var di=dIdx(c.day);if(di>=0&&di<PL.days.length)inTrip+=c.photos.length;
      if(c.la!=null){var b=null,bd=0.5;allSt.forEach(function(st){var k=km(c.la,c.lo,st[1],st[2]);if(k<bd){bd=k;b=st}});if(b&&!c.airport)c.name=b[0];return}});
    var byDay={};cl.forEach(function(c){if(c.la!=null)return;var di=dIdx(c.day);if(di<0||di>=PL.days.length||!PL.days[di].length)return;(byDay[di]=byDay[di]||[]).push(c)});
    Object.keys(byDay).forEach(function(di){var list=byDay[di],st=PL.days[di];list.forEach(function(c,k){var s=st[Math.min(st.length-1,Math.floor(k*st.length/list.length))];
      c.name=s[0];c.la=s[1];c.lo=s[2];c.city=PL.dest;c.cc=PL.abroad?'ZZ':'IL';c.guess=true;guessed+=c.photos.length})})}
  // 3. merge neighbours that got the same name
  var m=[];cl.forEach(function(c){var p=m[m.length-1];if(p&&p.day===c.day&&c.name&&p.name===c.name){p.photos=p.photos.concat(c.photos)}else m.push(c)});cl=m;
  // 4. chapters: the way out, days at the destination, the way back
  var abroad=cl.filter(function(c){return c.cc&&c.cc!=='IL'&&!c.airport}),isAbroad=abroad.length>0,core=isAbroad?abroad:cl;
  var cities={};core.forEach(function(c){if(c.city&&!c.airport)cities[c.city]=(cities[c.city]||0)+c.photos.length});
  var dest=(PL&&inTrip>=photos.length/2&&PL.dest)||Object.keys(cities).sort(function(a,b){return cities[b]-cities[a]})[0]||(isAbroad&&abroad[0].w&&abroad[0].w.country)||'הטיול שלנו';
  var first=isAbroad?cl.indexOf(abroad[0]):0,lastI=isAbroad?cl.indexOf(abroad[abroad.length-1]):cl.length-1;
  var ch=[];
  if(first>0)ch.push({title:'יוצאים לדרך',sub:cl[0].day?dm(cl[0].day):'',cls:cl.slice(0,first)});
  var days=[];cl.slice(first,lastI+1).forEach(function(c){var d=days[days.length-1];if(!d||d.day!==c.day){d={day:c.day,cls:[]};days.push(d)}d.cls.push(c)});
  var d0=days.length&&days[0].day?new Date(days[0].day+'T12:00:00').getTime():0;
  days.forEach(function(d,i){var no=d0&&d.day?Math.round((new Date(d.day+'T12:00:00').getTime()-d0)/864e5)+1:i+1;ch.push({title:'יום '+no,sub:(d.day?dm(d.day):'')+(dest?' · '+dest:''),cls:d.cls})});
  if(lastI<cl.length-1)ch.push({title:'חוזרים הביתה',sub:cl[lastI+1].day?dm(cl[lastI+1].day):'',cls:cl.slice(lastI+1)});
  ch.forEach(function(h){h.cls.forEach(function(c){c.photos.forEach(function(p){p.label=c.name||'';p.chapter=h.title})})});
  var dks=cl.map(function(c){return c.day}).filter(Boolean),named={};cl.forEach(function(c){if(c.name)named[c.name]=1});
  story={guessed:guessed,plan:!!(PL&&inTrip),dest:dest,chapters:ch,days:d0&&days.length&&days[days.length-1].day?Math.round((new Date(days[days.length-1].day+'T12:00:00').getTime()-d0)/864e5)+1:days.length,places:Object.keys(named).length,range:dks.length?dm(dks[0])+(dks[0]!==dks[dks.length-1]?'–'+dm(dks[dks.length-1]):'')+'.'+dks[0].slice(0,4):'',geo:geo};
  showStory();lens();busy=false;$('make').disabled=false}
function thumbs(){$('thumbs').innerHTML='';photos.forEach(function(p){var c=document.createElement('canvas');c.width=96;c.height=96;var x=c.getContext('2d'),s=Math.max(96/p.img.width,96/p.img.height);
  x.drawImage(p.img,(96-p.img.width*s)/2,(96-p.img.height*s)/2,p.img.width*s,p.img.height*s);$('thumbs').appendChild(c)})}
function showStory(){
  $('storysec').hidden=false;
  $('story').innerHTML='<p><b>'+esc(story.dest)+'</b> · '+esc(story.range)+'</p>'+story.chapters.map(function(h){
    var names=[];h.cls.forEach(function(c){if(c.name&&names.indexOf(c.name)<0)names.push(c.name)});
    var n=h.cls.reduce(function(s,c){return s+c.photos.length},0);
    return '<div><span><b>'+esc(h.title)+'</b> <span class="sub">'+esc(h.sub)+'</span><span class="sub">'+(names.length?esc(names.join(' · ')):'בלי מיקום')+'</span></span><span>'+n+'</span></div>'}).join('')+
    '<p class="muted">'+(story.guessed?story.guessed+' תמונות בלי מיקום שובצו לפי המסלול ששמרתם ב-HaniaGo ולפי שעת הצילום, ולכן השיבוץ שלהן משוער. ':'')+(story.plan?'תמונות שצולמו ליד מקום מהמסלול מקבלות את השם שלו. ':'')+'שאר השמות מגיעים מהמפה הפתוחה OpenStreetMap ולפעמים יהיו כלליים, כמו שם רחוב.</p>'}

// ---------- music ----------
function ctx(){if(!actx)actx=new (window.AudioContext||window.webkitAudioContext)();if(actx.state==='suspended')actx.resume();return actx}
async function getBuf(id){if(buffers[id])return buffers[id];var r=await fetch('/music/'+id+'.mp3');if(!r.ok)throw new Error('music');var ab=await r.arrayBuffer();
  buffers[id]=await new Promise(function(ok,no){ctx().decodeAudioData(ab,ok,no)});return buffers[id]}
function stopPreview(){if(previewSrc){try{previewSrc.stop()}catch(e){}previewSrc=null}previewId='';paintTracks()}
async function preview(id){var was=previewId;stopPreview();if(was===id)return;previewId=id;paintTracks();
  try{var b=await getBuf(id);if(previewId!==id)return;var s=ctx().createBufferSource();s.buffer=b;s.connect(ctx().destination);s.start();s.onended=function(){if(previewSrc===s){previewSrc=null;previewId='';paintTracks()}};previewSrc=s}
  catch(e){previewId='';paintTracks()}}
function paintTracks(){
  $('tracks').innerHTML=TRACKS.map(function(g){return '<div class="group"><h3>'+g[0]+'</h3>'+g[1].map(function(t){
    return '<div class="track'+(t[0]===track?' on':'')+'"><button class="pick" type="button" data-pick="'+t[0]+'" aria-pressed="'+(t[0]===track)+'"><span>'+t[1]+(t[2]?'<br><small>'+t[2]+'</small>':'')+'</span></button>'+
      '<button class="play" type="button" data-play="'+t[0]+'" aria-label="'+(previewId===t[0]?'עצירה':'השמעה')+' '+t[1]+'">'+(previewId===t[0]?'■':'▶')+'</button></div>'}).join('')+'</div>'}).join('')}
$('tracks').addEventListener('click',function(e){var p=e.target.closest('[data-pick]'),q=e.target.closest('[data-play]');if(p){track=p.dataset.pick;paintTracks()}if(q)preview(q.dataset.play)});
paintTracks();

// ---------- timeline and drawing ----------
var LEN='full';
function shortPicks(){ // one photo from each place, spread evenly when there are too many places
  var all=[];story.chapters.forEach(function(h){h.cls.forEach(function(c){all.push({p:c.photos[Math.floor((c.photos.length-1)/2)],h:h})})});
  var room=13;if(all.length<6){all=[];story.chapters.forEach(function(h){h.cls.forEach(function(c){c.photos.forEach(function(p){all.push({p:p,h:h})})})})}
  if(all.length<=room)return all;var out=[];for(var i=0;i<room;i++)out.push(all[Math.floor(i*all.length/room)]);return out}
function plan(){
  var sc=[],t=0,add=function(o,n){o.t0=t;o.len=n;sc.push(o);t+=n};
  if(LEN==='short'){add({k:'intro'},2.6);shortPicks().forEach(function(x){add({k:'photo',p:x.p,i:sc.length,h:x.h},1.8)});add({k:'outro'},3.8);return {sc:sc,len:t}}
  var per=Math.max(1.5,Math.min(2.7,75/photos.length));
  add({k:'intro'},3.4);
  story.chapters.forEach(function(h){add({k:'chapter',h:h},3);h.cls.forEach(function(c){c.photos.forEach(function(p){add({k:'photo',p:p,i:sc.length,h:h},per)})})});
  add({k:'outro'},4.2);return {sc:sc,len:t}}
function lens(){if(!story)return;var k=LEN,f,s;LEN='full';f=plan().len;LEN='short';s=plan().len;LEN=k;
  $('lfull').textContent=Math.round(f)+' שניות · כל התמונות · למשפחה';$('lshort').textContent=Math.round(s)+' שניות · תמונה מכל מקום · לסטורי ולרשתות'}
document.querySelector('.seg').addEventListener('click',function(e){var b=e.target.closest('[data-len]');if(!b)return;LEN=b.dataset.len;
  [].forEach.call(document.querySelectorAll('.seg [data-len]'),function(x){x.setAttribute('aria-checked',String(x===b))})});
function ease(x){return x<0?0:x>1?1:x<.5?2*x*x:1-Math.pow(-2*x+2,2)/2}
function cover(x,img,zoom,px,py){var s=Math.max(W/img.width,H/img.height)*zoom,w=img.width*s,h=img.height*s;x.drawImage(img,(W-w)/2+px*(w-W)/2,(H-h)/2+py*(h-H)/2,w,h)}
function text(x,s,px,py,font,col,al){x.font=font;x.fillStyle=col;x.textAlign=al||'center';x.direction='rtl';x.fillText(s,px,py)}
function fit(x,s,max,size,weight){var f=size;x.font=weight+' '+f+'px Rubik, Assistant, sans-serif';while(f>24&&x.measureText(s).width>max){f-=4;x.font=weight+' '+f+'px Rubik, Assistant, sans-serif'}return weight+' '+f+'px Rubik, Assistant, sans-serif'}
function roundRect(x,a,b,w,h,r){x.beginPath();x.moveTo(a+r,b);x.arcTo(a+w,b,a+w,b+h,r);x.arcTo(a+w,b+h,a,b+h,r);x.arcTo(a,b+h,a,b,r);x.arcTo(a,b,a+w,b,r);x.closePath()}
function drawScene(x,o,u){
  var B=x.globalAlpha;
  if(o.k==='photo'){var z=1.04+.10*u,dir=o.i%2?1:-1;cover(x,o.p.img,z,dir*(u-.5)*.6,(o.i%3-1)*.3*(u-.5));
    var g=x.createLinearGradient(0,H*.62,0,H);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,.62)');x.fillStyle=g;x.fillRect(0,H*.6,W,H*.4);
    x.globalAlpha=B*ease((u-.08)/.25);
    if(o.p.label)text(x,o.p.label,W-56,H-150,fit(x,o.p.label,W-112,54,800),'#fff','right');
    text(x,o.h.title+(story.dest&&o.h.title.indexOf('יום')===0?' · '+story.dest:''),W-56,o.p.label?H-98:H-130,'600 30px Assistant, sans-serif','rgba(255,255,255,.85)','right');return}
  if(o.k==='intro'||o.k==='outro'){
    var bg=photos[o.k==='intro'?0:photos.length-1].img;x.save();x.filter='blur(6px) brightness(.55)';cover(x,bg,1.15+.06*u,0,0);x.restore();
    x.fillStyle='rgba(11,122,140,.35)';x.fillRect(0,0,W,H);
    var a1=ease(u/.3),a2=ease((u-.15)/.3);
    if(o.k==='intro'){x.globalAlpha=B*a1;text(x,story.dest,W/2,H/2-10+(1-a1)*30,fit(x,story.dest,W-80,150,800),'#fff');
      x.globalAlpha=B*a2;text(x,story.range+(story.days>1?' · '+story.days+' ימים':''),W/2,H/2+80,'600 40px Assistant, sans-serif','rgba(255,255,255,.92)')}
    else{x.globalAlpha=B*a1;text(x,story.dest,W/2,H/2-210,fit(x,story.dest,W-80,110,800),'#fff');
      var st=[[story.days,'ימים'],[story.places,'מקומות'],[photos.length,'תמונות']].filter(function(r){return r[0]>0});
      x.globalAlpha=B*a2;st.forEach(function(r,i){var cx=W/2+((st.length-1)/2-i)*200;
        text(x,String(r[0]),cx,H/2-80,'800 76px Rubik, Assistant, sans-serif',SUN);text(x,r[1],cx,H/2-34,'600 30px Assistant, sans-serif','#fff')});
      x.globalAlpha=B*ease((u-.3)/.25);
      x.fillStyle='rgba(255,255,255,.96)';roundRect(x,70,H/2+60,W-140,300,32);x.fill();
      text(x,'את הטיול הזה תכננו ב-',W/2,H/2+128,'600 32px Assistant, sans-serif',INK);
      text(x,'HaniaGo',W/2,H/2+210,'700 76px Rubik, Assistant, sans-serif',SEA);
      text(x,'תכנון טיול משפחתי, מהבית ועד המלון',W/2,H/2+262,'600 28px Assistant, sans-serif',INK);
      text(x,'go.hania360.com',W/2,H/2+318,'700 34px Assistant, sans-serif',SEA)}
    return}
  if(o.k==='chapter')drawChapter(x,o.h,u,B)}
function drawChapter(x,h,u,B){
  x.fillStyle=PAPER;x.fillRect(0,0,W,H);
  var pts=h.cls.filter(function(c){return c.la!=null}),names=[];h.cls.forEach(function(c){if(c.name&&names.indexOf(c.name)<0)names.push(c.name)});
  x.globalAlpha=B*ease(u/.25);
  text(x,h.title,W-70,190,fit(x,h.title,W-140,96,800),SEA,'right');
  if(h.sub)text(x,h.sub,W-70,250,'600 34px Assistant, sans-serif',INK,'right');
  x.globalAlpha=B;
  var box={x:70,y:320,w:W-140,h:700};
  if(pts.length){
    var la=pts.map(function(c){return c.la}),lo=pts.map(function(c){return c.lo});
    var mnla=Math.min.apply(0,la),mxla=Math.max.apply(0,la),mnlo=Math.min.apply(0,lo),mxlo=Math.max.apply(0,lo);
    var k=Math.cos((mnla+mxla)/2*Math.PI/180),spanX=Math.max((mxlo-mnlo)*k,.004),spanY=Math.max(mxla-mnla,.004),s=Math.min(box.w/spanX,box.h/spanY)*.74;
    var cx=(mnlo+mxlo)/2,cy=(mnla+mxla)/2,P=function(c){return [box.x+box.w/2-(cx-c.lo)*k*s,box.y+box.h/2+(cy-c.la)*s]};
    x.fillStyle='#fff';roundRect(x,box.x-20,box.y-20,box.w+40,box.h+40,36);x.fill();
    x.save();roundRect(x,box.x-20,box.y-20,box.w+40,box.h+40,36);x.clip();
    x.strokeStyle='#E3ECEE';x.lineWidth=2;for(var gx=box.x-20;gx<box.x+box.w+20;gx+=48){x.beginPath();x.moveTo(gx,box.y-20);x.lineTo(gx+30,box.y+box.h+20);x.stroke()}
    for(var gy=box.y-20;gy<box.y+box.h+20;gy+=56){x.beginPath();x.moveTo(box.x-20,gy);x.lineTo(box.x+box.w+20,gy-14);x.stroke()}
    var q=pts.map(P),prog=ease((u-.12)/.6)*(q.length-1);
    if(q.length>1){x.strokeStyle=SEA;x.lineWidth=11;x.lineCap='round';x.lineJoin='round';x.setLineDash([2,22]);x.beginPath();x.moveTo(q[0][0],q[0][1]);
      for(var i=1;i<q.length;i++){var f=Math.max(0,Math.min(1,prog-(i-1)));if(f<=0)break;x.lineTo(q[i-1][0]+(q[i][0]-q[i-1][0])*f,q[i-1][1]+(q[i][1]-q[i-1][1])*f)}
      x.stroke();x.setLineDash([])}
    for(i=0;i<q.length;i++){if(q.length>1&&prog<i-.15)continue;x.fillStyle=pts[i].airport?INK:SEA;x.beginPath();x.arc(q[i][0],q[i][1],30,0,7);x.fill();
      text(x,pts[i].airport?'✈':String(i+1),q[i][0],q[i][1]+11,'800 30px Rubik, sans-serif','#fff')}
    x.restore()}
  names.slice(0,5).forEach(function(nm,j){x.globalAlpha=B*ease((u-.2-j*.1)/.2);var yy=(pts.length?1110:420)+j*46;
    x.fillStyle=SEA;x.beginPath();x.arc(W-86,yy-10,16,0,7);x.fill();text(x,String(j+1),W-86,yy-2,'800 20px Rubik, sans-serif','#fff');
    text(x,nm,W-116,yy,fit(x,nm,W-200,32,600),INK,'right')});
  x.globalAlpha=B}
function frame(x,pl,t){
  x.globalAlpha=1;x.fillStyle='#000';x.fillRect(0,0,W,H);
  for(var i=0;i<pl.sc.length;i++){var o=pl.sc[i];if(t<o.t0||t>=o.t0+o.len+X)continue;
    var u=Math.min(1,(t-o.t0)/(o.len+X));x.globalAlpha=(i>0&&t<o.t0+X)?ease((t-o.t0)/X):1;
    x.save();drawScene(x,o,u);x.restore()}
  x.globalAlpha=1}

// ---------- recording and sharing ----------
var outURL='',outFile=null,wake=null;
function pickMime(){var c=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4;codecs=avc1,mp4a','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
  for(var i=0;i<c.length;i++)if(window.MediaRecorder&&MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(c[i]))return c[i];return ''}
$('make').addEventListener('click',make);$('again').addEventListener('click',make);
async function make(){
  if(!story)return;stopPreview();$('make').disabled=true;$('done').hidden=true;$('saved').hidden=true;$('out').hidden=true;$('fmt').textContent='';
  var cv=$('cv'),x=cv.getContext('2d');cv.hidden=false;$('prog').hidden=false;$('progt').textContent='מכין…';$('bari').style.width='0';
  try{await Promise.all([document.fonts.load('800 60px Rubik'),document.fonts.load('600 30px Assistant')])}catch(e){}
  if(!window.MediaRecorder||!cv.captureStream){$('progt').innerHTML='<span class="err">הדפדפן הזה לא יודע להקליט וידאו. נסו בכרום.</span>';$('make').disabled=false;return}
  var pl=plan(),buf;
  try{buf=await getBuf(track)}catch(e){$('progt').innerHTML='<span class="err">המוזיקה לא נטענה. בדקו חיבור ונסו שוב.</span>';$('make').disabled=false;return}
  var ac=ctx(),dest=ac.createMediaStreamDestination(),gain=ac.createGain(),src=ac.createBufferSource();
  src.buffer=buf;src.loop=buf.duration<pl.len+1;src.connect(gain);gain.connect(dest);gain.connect(ac.destination);
  var stream=new MediaStream([cv.captureStream(FPS).getVideoTracks()[0],dest.stream.getAudioTracks()[0]]);
  var mime=pickMime(),chunks=[],rec;
  try{rec=new MediaRecorder(stream,mime?{mimeType:mime,videoBitsPerSecond:5e6,audioBitsPerSecond:128e3}:{})}catch(e){rec=new MediaRecorder(stream)}
  rec.ondataavailable=function(e){if(e.data&&e.data.size)chunks.push(e.data)};
  try{wake=await navigator.wakeLock.request('screen')}catch(e){}
  frame(x,pl,0);
  var a0=ac.currentTime+0.05;src.start(a0);gain.gain.setValueAtTime(1,a0);gain.gain.setValueAtTime(1,a0+pl.len-1.6);gain.gain.linearRampToValueAtTime(0,a0+pl.len);
  rec.start(500);var t0=performance.now()+50;
  await new Promise(function(done){(function tick(){var t=(performance.now()-t0)/1000;frame(x,pl,Math.max(0,Math.min(t,pl.len-0.01)));
    $('bari').style.width=Math.min(100,t/pl.len*100)+'%';$('progt').textContent='מקליט… '+Math.max(0,Math.ceil(pl.len-t))+' שניות';
    if(t>=pl.len+0.2)done();else requestAnimationFrame(tick)})()});
  await new Promise(function(ok){rec.onstop=ok;rec.stop()});
  try{src.stop()}catch(e){}try{if(wake)wake.release()}catch(e){}
  var type=(rec.mimeType||mime||'video/webm').split(';')[0],ext=type.indexOf('mp4')>=0?'mp4':'webm';
  var blob=new Blob(chunks,{type:type});if(outURL)URL.revokeObjectURL(outURL);outURL=URL.createObjectURL(blob);
  outFile=new File([blob],'haniago-trip.'+ext,{type:type});
  cv.hidden=true;$('prog').hidden=true;var v=$('out');v.src=outURL;v.hidden=false;
  $('save').href=outURL;$('save').download=outFile.name;$('done').hidden=false;$('make').disabled=false;
  var can=false;try{can=!!(navigator.canShare&&navigator.canShare({files:[outFile]}))}catch(e){}$('share').hidden=!can;
  $('fmt').textContent='פורמט: '+ext.toUpperCase()+' · '+(blob.size/1048576).toFixed(1)+' MB · '+Math.round(pl.len)+' שניות'+(ext==='webm'?'. קובץ WEBM לא תמיד נפתח בוואטסאפ ובאייפון.':'');
  ev('video_make')}
var CAPTION=function(){return 'הטיול שלנו ל'+story.dest+'. תכננו אותו ב-HaniaGo, מתכנן טיולים למשפחות: https://go.hania360.com/?from=video'};
$('share').addEventListener('click',function(){if(!outFile||!navigator.share)return;
  navigator.share({files:[outFile],text:CAPTION()}).then(function(){ev('video_share')}).catch(function(){})});
$('save').addEventListener('click',function(){$('saved').hidden=false});
})();
