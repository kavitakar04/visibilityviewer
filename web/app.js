'use strict';
const C={lat:48.3819679,lon:-103.4400307};
const RESIDENTIAL_PROPERTIES=[
 {id:'res-1',label:'Residence 1',lat:48.3576053,lon:-103.3996261},
 {id:'res-2',label:'Residence 2',lat:48.3878324,lon:-103.3817375},
 {id:'res-3',label:'Residence 3',lat:48.3500379,lon:-103.4757342},
 {id:'res-4',label:'Residence 4',lat:48.4442536,lon:-103.4695970},
 {id:'res-5',label:'Residence 5',lat:48.3444077,lon:-103.5596871},
 {id:'res-6',label:'Residence 6',lat:48.414674,lon:-103.386483}
];
const DEFAULT_PROPERTY_ID='res-1';
const DEFAULT_PROPERTY=RESIDENTIAL_PROPERTIES.find(p=>p.id===DEFAULT_PROPERTY_ID);
const BUILDING_HEIGHT_FT=55;
const BUILDING_BEARING_DEG=0;
let RADII=[2,4,6,8],ringSampleCount=12;const FT=0.3048,MI=1609.344,R=6371000,RE=R/(1-.13);
const PROPERTY_VIEWSHED_RADIUS=2.25*MI;
let ANALYSIS_RADIUS_M=10.2*MI;
let dem=null,model=null,selected={lat:DEFAULT_PROPERTY.lat,lon:DEFAULT_PROPERTY.lon},chosenLabel=DEFAULT_PROPERTY.label,selectedPropertyId=DEFAULT_PROPERTY.id,resReady=false,points=[],segments=[];
const propertyResults=new Map(),propertyMarkers=new Map();
const el=id=>document.getElementById(id),toRad=x=>x*Math.PI/180,toDeg=x=>x*180/Math.PI;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function coord(lat,lon){return {lat,lon};}
function shift(p,e,n){return {lat:p.lat+n/111320,lon:p.lon+e/(111320*Math.cos(toRad(p.lat)))};}
function move(p,d,az){return shift(p,d*Math.sin(toRad(az)),d*Math.cos(toRad(az)));}
function hav(a,b){const la=toRad(a.lat),lb=toRad(b.lat),dlat=lb-la,dlon=toRad(b.lon-a.lon);const s=Math.sin(dlat/2)**2+Math.cos(la)*Math.cos(lb)*Math.sin(dlon/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(s)));}
function heading(a,b){const p1=toRad(a.lat),p2=toRad(b.lat),dl=toRad(b.lon-a.lon);return (toDeg(Math.atan2(Math.sin(dl)*Math.cos(p2),Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl)))+360)%360;}
function lerp(a,b,t){return a+(b-a)*t;}
function between(a,b,t){return {lat:lerp(a.lat,b.lat,t),lon:lerp(a.lon,b.lon,t)};}
function latlon(p){return [p.lat,p.lon];}
ANALYSIS_RADIUS_M=Math.max(10.2*MI,...RESIDENTIAL_PROPERTIES.map(p=>hav(p,C)+PROPERTY_VIEWSHED_RADIUS));
function styleColor(s){return s==='clear'?'#d9534f':s==='partial'?'#e8bd36':s==='blocked'?'#3d9875':'#9caaba';}
function styleText(s){return s==='clear'?'Visible':s==='partial'?'Partly visible':s==='blocked'?'Not Visible':'No data';}
function setStatus(text,type=''){el('status').hidden=type==='ok';el('status').textContent=text;el('status').className='status-pill'+(type?' '+type:'');}
function loadProgress(done,total){const pct=Math.round(done/total*100);el('loadMsg').innerHTML=`Loading elevation tiles… ${done} / ${total}<div class="pbar"><div id="loadBar" style="width:${pct}%;background:#42c6c8;height:100%"></div></div>`;}
function tilePos(lat,lon,z){const n=2**z;const lt=clamp(lat,-85.051129,85.051129);return {x:(lon+180)/360*n,y:(1-Math.asinh(Math.tan(toRad(lt)))/Math.PI)/2*n};}
class Terrain{
 constructor(z){this.z=z;this.tiles=new Map();this.cache=new Map();}
 async fetchTile(x,y){
  // The Python server proxies and caches elevation tiles from two public sources.
  // Do not fetch the tiles directly with browser CORS restrictions or from file://.
  const url=`/api/terrain/${this.z}/${x}/${y}`;
  const resp=await fetch(url,{cache:'force-cache'});
  if(!resp.ok){let why='HTTP '+resp.status;try{const msg=await resp.json();why=msg.error||why;}catch(_){}throw new Error(`Elevation ${this.z}/${x}/${y}: ${why}`);}
  const blob=await resp.blob();
  const img=await createImageBitmap(blob);
  const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
  if(img.close)img.close();
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  const values=new Float32Array(canvas.width*canvas.height);
  for(let i=0;i<values.length;i++){const k=i*4;values[i]=pixels[k]*256+pixels[k+1]+pixels[k+2]/256-32768;}
  return {z:this.z,x,y,w:canvas.width,h:canvas.height,arr:values};
 }
 async load(center,radius){const north=shift(center,0,radius),south=shift(center,0,-radius),west=shift(center,-radius,0),east=shift(center,radius,0);const min=tilePos(north.lat,west.lon,this.z),max=tilePos(south.lat,east.lon,this.z);let arr=[];for(let x=Math.floor(min.x);x<=Math.floor(max.x);x++)for(let y=Math.floor(min.y);y<=Math.floor(max.y);y++)arr.push([x,y]);this.bounds={minLat:south.lat,maxLat:north.lat,minLon:west.lon,maxLon:east.lon};let pos=0,done=0;const workers=Array.from({length:Math.min(6,arr.length)},async()=>{while(pos<arr.length){const [x,y]=arr[pos++];if(!this.tiles.has(x+','+y)){const t=await this.fetchTile(x,y);this.tiles.set(x+','+y,t);}done++;loadProgress(done,arr.length);}});await Promise.all(workers);}
 at(p){
  const pos=tilePos(p.lat,p.lon,this.z),tx=Math.floor(pos.x),ty=Math.floor(pos.y);
  const tile=this.tiles.get(tx+','+ty);if(!tile)return NaN;
  const x=clamp((pos.x-tx)*tile.w,0,tile.w-1.00001);
  const y=clamp((pos.y-ty)*tile.h,0,tile.h-1.00001);
  const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(tile.w-1,x0+1),y1=Math.min(tile.h-1,y0+1);
  const fx=x-x0,fy=y-y0,a=tile.arr;
  return lerp(lerp(a[y0*tile.w+x0],a[y0*tile.w+x1],fx),lerp(a[y1*tile.w+x0],a[y1*tile.w+x1],fx),fy);
 }
}
const map=L.map('map',{zoomControl:false,preferCanvas:true}).setView([C.lat,C.lon],12);
new ResizeObserver(()=>map.invalidateSize({pan:false})).observe(el('map'));
L.control.zoom({position:'bottomleft'}).addTo(map);L.control.scale({imperial:true,metric:false,position:'bottomleft'}).addTo(map);
const topo=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',{maxZoom:18,crossOrigin:'anonymous',attribution:'© Esri / contributors'});
const sat=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:18,crossOrigin:'anonymous',attribution:'© Esri World Imagery'});
topo.addTo(map);
const contours=L.layerGroup().addTo(map),residentialLayer=L.layerGroup().addTo(map),ringLines=L.layerGroup().addTo(map),viewpoints=L.layerGroup().addTo(map),sight=L.layerGroup().addTo(map),building=L.layerGroup().addTo(map);
const driveLayer=L.layerGroup();
const videoLocation=L.circleMarker([48.3846,-103.4507],{radius:6,color:'#fff',weight:2,fillColor:'#6657a4',fillOpacity:1}).addTo(map).bindTooltip('Site video · approximate recorded location').bindPopup('Site video: approximate location from embedded metadata. Camera direction and precise position are unverified.');
const ownerParcels=L.geoJSON(null,{style:{stroke:false,fillColor:'#378fc9',fillOpacity:.35},onEachFeature:(feature,layer)=>layer.bindTooltip('Berger Property')}).addTo(map);
L.control.layers({'Topo map':topo,'Satellite':sat},{'Berger Property':ownerParcels,'Terrain contours':contours,'Residential properties':residentialLayer,'Visibility ring arcs':ringLines,'Sample viewing points':viewpoints,'Sightline':sight,'Building footprint':building,'County roads':driveLayer},{collapsed:true,position:'topright'}).addTo(map);
fetch('./owner-land-area.geojson').then(response=>{if(!response.ok)throw new Error('Parcel data unavailable');return response.json();}).then(data=>{ownerParcels.addData(data);}).catch(error=>{console.error(error);el('parcelStatus').textContent='Berger Property unavailable';});
let buildingShape=null;
L.circleMarker(latlon(C),{radius:5,color:'#fff3c6',fillColor:'#eac067',fillOpacity:1,weight:2}).addTo(building).bindTooltip('Data center location');
function propertyPoint(prop){return {lat:prop.lat,lon:prop.lon};}
function propertyById(id){return RESIDENTIAL_PROPERTIES.find(p=>p.id===id);}
function propertyIcon(prop){
 const active=prop.id===selectedPropertyId?' active':'';
 return L.divIcon({className:'',html:`<div class="residence-marker${active}" title="${prop.label}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 3l9 8h-2v9h-5v-6h-4v6H5v-9z"/></svg></div>`,iconSize:[32,32],iconAnchor:[16,16]});
}
function renderResidentialProperties(){
 residentialLayer.clearLayers();propertyMarkers.clear();
 for(const prop of RESIDENTIAL_PROPERTIES){
  const result=propertyResults.get(prop.id);
  const tip=result?`${prop.label} · Terrain: ${styleText(result.state)}`:prop.label;
  const marker=L.marker(latlon(prop),{icon:propertyIcon(prop)}).addTo(residentialLayer).bindTooltip(tip);
  marker.on('click',e=>{L.DomEvent.stopPropagation(e);selectProperty(prop.id);});
  propertyMarkers.set(prop.id,marker);
 }
}
function updatePropertyMarkerStyles(){
 for(const prop of RESIDENTIAL_PROPERTIES){
  const marker=propertyMarkers.get(prop.id);
  if(marker){
   const result=propertyResults.get(prop.id);
   marker.setIcon(propertyIcon(prop));
   marker.bindTooltip(result?`${prop.label} · Terrain: ${styleText(result.state)}`:prop.label);
  }
 }
}
function hallPoints(angle){const a=toRad(angle),raw=[[-350,-200],[350,-200],[350,200],[-350,200],[0,0],[0,-200],[350,0],[0,200],[-350,0]];return [300,-300].flatMap(north=>[-850,0,850].map(east=>raw.map(([e,n])=>shift(C,((e+east)*Math.cos(a)+(n+north)*Math.sin(a))*FT,(-(e+east)*Math.sin(a)+(n+north)*Math.cos(a))*FT))));}
function roofPoints(angle){return hallPoints(angle).flat();}
function enginePoints(angle){const a=toRad(angle),raw=[[-95,-140],[95,-140],[95,140],[-95,140],[0,0],[0,-140],[95,0],[0,140],[-95,0]];return [200,-200].flatMap(north=>[2100,2370,2640].map(east=>raw.map(([e,n])=>shift(C,((e+east)*Math.cos(a)+(n+north)*Math.sin(a))*FT,(-(e+east)*Math.sin(a)+(n+north)*Math.cos(a))*FT))));}
function drawBuilding(){building.clearLayers();buildingShape=hallPoints(BUILDING_BEARING_DEG).map(hall=>hall.slice(0,4));buildingShape.forEach((shape,index)=>L.polygon(shape.map(latlon),{color:'#315c7a',weight:3,fillColor:'#9aabb4',fillOpacity:.36}).addTo(building).bindTooltip(`DH-${index+1} · 700 × 400 ft · 55 ft roof · coolers to 62 ft`));enginePoints(BUILDING_BEARING_DEG).forEach((shape,index)=>L.polygon(shape.slice(0,4).map(latlon),{color:'#536b79',fillColor:'#7b8f9d',weight:2,fillOpacity:.55}).addTo(building).bindTooltip(`G${index+1} · 190 × 280 ft · 43 ft roof · stack to 75 ft; position estimated`));L.circleMarker(latlon(C),{radius:5,color:'#fff1c5',fillColor:'#eac067',fillOpacity:1}).addTo(building);}
drawBuilding();
function buildRings(){ringLines.clearLayers();viewpoints.clearLayers();points=[];segments=[];const N=72;for(const r of RADII){const D=r*MI;for(let i=0;i<N;i++){const a=i*360/N,b=(i+1)*360/N;const p=move(C,D,(a+b)/2);const item={r,a,b,p,vis:null};segments.push(item);
 const arc=[move(C,D,a),move(C,D,a+(b-a)/2),move(C,D,b)];item.line=L.polyline(arc.map(latlon),{color:styleColor('unknown'),weight:7,opacity:.70,interactive:true}).addTo(ringLines);item.line.on('click',e=>{L.DomEvent.stopPropagation(e);setView(item.p,`${r} mile ring`);});
 if(i%(N/ringSampleCount)===0){const obj={r,i,p:move(C,D,a),vis:null};points.push(obj);obj.marker=L.circleMarker(latlon(obj.p),{radius:5,weight:1.7,color:'#fff',fillColor:'#9daaba',fillOpacity:1}).addTo(viewpoints);obj.marker.on('click',e=>{L.DomEvent.stopPropagation(e);setView(obj.p,`${r} mi • ${Math.round(a)}°`)});obj.marker.bindTooltip(`${r} mi / ${Math.round(a)}° · Click to look toward data center`);}
 }
 const pp=move(C,D,25);L.marker(latlon(pp),{icon:L.divIcon({className:'data-label',html:r.toString()+' mi',iconAnchor:[-5,0]}) ,interactive:false}).addTo(viewpoints);
 }}
buildRings();
renderResidentialProperties();
const bounds=L.latLngBounds([
 [shift(C,-10.1*MI,-10.1*MI).lat,shift(C,-10.1*MI,-10.1*MI).lon],
 [shift(C,10.1*MI,10.1*MI).lat,shift(C,10.1*MI,10.1*MI).lon],
 ...RESIDENTIAL_PROPERTIES.map(p=>latlon(p))
]);map.fitBounds(bounds,{padding:[45,45]});
requestAnimationFrame(()=>{map.invalidateSize();map.fitBounds(bounds,{padding:[45,45]});});
function crossLine(a,b,roofAlt,eye){const dist=hav(a,b),n=Math.max(8,Math.ceil(dist/16)),startAlt=dem.at(a),h0=startAlt+eye,h1=roofAlt;if(!Number.isFinite(startAlt)||!Number.isFinite(h0)||!Number.isFinite(h1))return {distance:dist,clearance:NaN,blockAt:NaN,terrain:[],visible:false,unknown:true,h0,h1};let clearance=Infinity,blockAt=NaN;const terrain=[];
 for(let i=0;i<=n;i++){const t=i/n,p=between(a,b,t),d=dist*t;const ht=dem.at(p);if(!Number.isFinite(ht))return {distance:dist,clearance:NaN,blockAt:NaN,terrain:[],visible:false,unknown:true,h0,h1};const bulge=d*(dist-d)/(2*RE);const effective=ht+bulge;const sightLine=lerp(h0,h1,t);terrain.push({d,h:effective,los:sightLine,base:ht});if(i>0&&i<n&&Number.isFinite(ht)){const gap=sightLine-effective;if(gap<clearance){clearance=gap;blockAt=d;}}}
 return {distance:dist,clearance,blockAt,terrain,visible:clearance>=0,h0,h1};}
function buildingPadElevation(){return dem.at(C);}
function classify(p,includeProfiles=false){if(!dem)return {state:'unknown',visible:0,total:0};const foot=roofPoints(BUILDING_BEARING_DEG);const halls=hallPoints(BUILDING_BEARING_DEG),engines=enginePoints(BUILDING_BEARING_DEG);const targets=[...foot.map(point=>({point,height:BUILDING_HEIGHT_FT})),...halls.map(hall=>({point:hall[4],height:62})),...engines.flatMap(engine=>[...engine.map(point=>({point,height:43})),{point:engine[4],height:75}])];const padAlt=buildingPadElevation();if(!Number.isFinite(padAlt))return {state:'unknown',visible:0,total:foot.length};const roofAlt=padAlt+BUILDING_HEIGHT_FT*FT,eye=Number(el('eye').value)*FT;let clear=0,unknown=false,selectedLine=null,nearest=Infinity,ref=foot[4];for(const target of targets){const q=target.point,line=crossLine(p,q,padAlt+target.height*FT,eye);if(line.unknown)unknown=true;if(line.visible)clear++;const d=hav(p,q);if(d<nearest){nearest=d;selectedLine=line;ref=q;}}
 // The near-roof point has the clearest spatial interpretation in a 2D section; full-footprint result aggregates all 9 points.
 const centerLine=crossLine(p,foot[13],roofAlt,eye);const state=unknown||selectedLine?.unknown||centerLine?.unknown?'unknown':clear===0?'blocked':clear===targets.length?'clear':'partial';return {state,visible:clear,total:targets.length,centerLine,nearestLine:selectedLine,roofAlt,foot,reference:ref};}
function azName(a){const d=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];return d[Math.round(a/22.5)%16];}
function updateSelectionLabels(){
 el('selectedName').textContent=chosenLabel;
 el('selectedKind').textContent=selectedPropertyId?'Property':'Map point';
 updatePropertyMarkerStyles();
}
function updatePropertySummary(v){
 const s=v?.state||'unknown',dist=hav(selected,C);
 el('propertyState').textContent=styleText(s);
 el('propertyState').style.color=({clear:'#a53d3d',partial:'#826300',blocked:'#216a53',unknown:'#596b70'})[s];
 el('propertyNumbers').textContent=`Distance: ${(dist/MI).toFixed(2)} mi`;
}
function renderPropertyList(){
 const list=el('propertyList');if(!list)return;
 list.innerHTML=RESIDENTIAL_PROPERTIES.map(prop=>{
  const result=propertyResults.get(prop.id),state=result?.state||'unknown',active=prop.id===selectedPropertyId?' active':'';
  return `<button class="property-option${active}" data-property-id="${prop.id}"><span class="property-icon">⌂</span><span><strong>${prop.label}</strong><br><span class="property-meta">${(hav(prop,C)/MI).toFixed(2)} mi</span></span><span class="property-result ${state}">${styleText(state)}</span></button>`;
 }).join('');
 list.querySelectorAll('[data-property-id]').forEach(btn=>btn.addEventListener('click',()=>selectProperty(btn.dataset.propertyId)));
}
function selectProperty(id){
 const prop=propertyById(id);if(!prop)return;
 setView(propertyPoint(prop),prop.label,prop.id);
}
function drawSelection(){sight.clearLayers();if(!selected)return;const bearing=heading(selected,C),D=hav(selected,C);const color=styleColor(model?.state||'unknown');L.polyline([latlon(selected),latlon(C)],{color:'#101c29',weight:6,opacity:.7}).addTo(sight);L.polyline([latlon(selected),latlon(C)],{color:color,weight:3,opacity:.95,dashArray:model?.state==='blocked'?'5,6':null}).addTo(sight);const span=18,cones=Math.min(D*.35,500);const left=move(selected,cones,bearing-span),right=move(selected,cones,bearing+span);L.polygon([latlon(selected),latlon(left),latlon(right)],{stroke:false,fillColor:'#4a8fbe',fillOpacity:.10,interactive:false}).addTo(sight);L.circleMarker(latlon(selected),{radius:8,color:'#fff',weight:2,fillColor:'#2674b6',fillOpacity:1}).addTo(sight).bindPopup(`${chosenLabel}<br>Click elsewhere to move observer`);el('compass').textContent=`${Math.round(bearing)}° · ${azName(bearing)}`;
}
function yNorm(v,min,max,top=20,bottom=224){return top+(max-v)/(max-min)*(bottom-top);}
function profileSVG(data){if(!data||data.unknown||!data.terrain?.length)return '<svg viewBox="0 0 660 240"><text x="24" y="110" fill="#a9bed1">Awaiting elevation data…</text></svg>';const arr=data.terrain,lo=Math.min(...arr.map(d=>d.h),data.h0,data.h1,data.h1-BUILDING_HEIGHT_FT*FT)-3,hi=Math.max(...arr.map(d=>d.h),data.h0,data.h1)+4;const x=d=>50+d/data.distance*580,y=v=>yNorm(v,lo,hi,18,211);const angle=toRad(heading(selected,roofPoints(BUILDING_BEARING_DEG)[13])-BUILDING_BEARING_DEG),hallDepth=(700*Math.abs(Math.sin(angle))+400*Math.abs(Math.cos(angle)))*FT,buildingWidth=580*hallDepth/data.distance,buildingLeft=630-buildingWidth/2,buildingRight=630+buildingWidth/2,chartWidth=Math.max(660,buildingRight+20),buildingBase=y(data.h1-BUILDING_HEIGHT_FT*FT),buildingTop=y(data.h1);const ground='M'+arr.map(p=>x(p.d).toFixed(1)+' '+y(p.h).toFixed(1)).join(' L')+` L630 215 L50 215 Z`;const line=`M${x(0)} ${y(data.h0)} L${x(data.distance)} ${y(data.h1)}`;const terrainline=`M`+arr.map(p=>x(p.d).toFixed(1)+' '+y(p.h).toFixed(1)).join(' L');const xBlocks=Number.isFinite(data.blockAt)?x(data.blockAt).toFixed(1):null;const yBlocks=Number.isFinite(data.blockAt)?y(data.terrain[Math.round(data.blockAt/data.distance*(arr.length-1))].h).toFixed(1):null;let gr='';for(let i=0;i<5;i++){const val=lo+(hi-lo)*i/4,yy=y(val);gr+=`<line x1="50" x2="630" y1="${yy}" y2="${yy}" stroke="#7799a3" stroke-dasharray="3 6"/><text x="45" y="${yy+4}" text-anchor="end" fill="#253d44" font-size="11">${Math.round(val/FT)} ft</text>`;}
return `<svg viewBox="0 0 ${chartWidth} 240" width="${chartWidth}" height="240" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg"><rect width="${chartWidth}" height="240" rx="8" fill="#b9dfee"/>${gr}<path d="${ground}" fill="#a77d5c" fill-opacity="1"/><path d="${terrainline}" fill="none" stroke="#674832" stroke-width="2"/><path d="${line}" fill="none" stroke="${data.visible?'#f17a72':'#66c99b'}" stroke-width="3" stroke-dasharray="7 5"/>${selectedPropertyId?`<g transform="translate(40 ${y(arr[0].h)-20})" fill="#fff2b2" stroke="#0d2031" stroke-width="1"><path d="M0 10 10 1l10 9h-2v10h-6v-6H8v6H2V10z"/></g>`:`<g transform="translate(50 ${y(arr[0].h)-19})" fill="#fff2b2" stroke="#0d2031" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="0" cy="3" r="3"/><path d="M0 7v7m-5-4 5-2 5 2m-5 4-4 5m4-5 4 5" fill="none"/></g>`}<path d="M${buildingLeft} ${buildingBase} H${buildingRight} V215 H${buildingLeft} Z" fill="#a77d5c"/><line x1="${buildingLeft}" x2="${buildingRight}" y1="${buildingBase}" y2="${buildingBase}" stroke="#79573e" stroke-width="2"/><rect x="${buildingLeft}" y="${buildingTop}" width="${buildingWidth}" height="${buildingBase-buildingTop}" fill="#a5b5bf" stroke="#355e79" stroke-width="1.5"/><line x1="${buildingLeft}" x2="${buildingRight}" y1="${buildingBase}" y2="${buildingBase}" stroke="#355e79" stroke-width="2"/><circle cx="50" cy="${y(data.h0)}" r="3" fill="#fff" stroke="#253d44"/><circle cx="630" cy="${y(data.h1)}" r="3" fill="#fff" stroke="#253d44"/>${!data.visible&&xBlocks?`<circle cx="${xBlocks}" cy="${yBlocks}" r="6" fill="#66c99b" stroke="white" stroke-width="1.5"/>`:''}<line x1="50" x2="630" y1="219" y2="219" stroke="#526a70" stroke-width="1"/><line x1="50" x2="50" y1="216" y2="223" stroke="#526a70"/><line x1="630" x2="630" y1="216" y2="223" stroke="#526a70"/><text x="50" y="234" fill="#253d44" font-size="11">Viewer · 0 mi</text><text x="630" y="234" text-anchor="end" fill="#253d44" font-size="11">Building · ${(data.distance/MI).toFixed(2)} mi</text></svg>`;}
function modelPerspective(cameraBearing=null,panorama=false){if(!dem||!model)return '<svg viewBox="0 0 700 230"><text x="25" y="100" fill="#afc2d5">Awaiting terrain...</text></svg>';
 const night=el('viewTime').value==='night';const siteBearing=heading(selected,C),bear=cameraBearing===null?siteBearing:cameraBearing,D=hav(selected,C);const groundAtViewer=dem.at(selected),base=buildingPadElevation(),eye=groundAtViewer+Number(el('eye').value)*FT,roof=base+BUILDING_HEIGHT_FT*FT;if(!Number.isFinite(groundAtViewer)||!Number.isFinite(base)||!Number.isFinite(eye)||!Number.isFinite(roof))return '<svg viewBox="0 0 700 230"><text x="25" y="100" fill="#afc2d5">Not evaluated: missing elevation data.</text></svg>';const FOV=panorama?180:44;const viewWidth=panorama?2220:740,viewHeight=235,ground=[],angleSamples=[];
 // Sample terrain across the selected horizontal field of view.
 for(let i=0;i<= (panorama?300:100);i++){const samples=panorama?300:100;const az=bear-FOV/2+i*FOV/samples;let high=-90;for(let d=40;d<Math.max(60,D-35);d+=Math.max(22,d*.012)){let hh=dem.at(move(selected,d,az));if(!Number.isFinite(hh))return '<svg viewBox="0 0 740 235" xmlns="http://www.w3.org/2000/svg"><rect width="740" height="235" fill="#b9dded"/><text x="25" y="100" fill="#243c45">View unavailable: missing elevation data.</text></svg>';hh-=d*d/(2*RE);const an=toDeg(Math.atan2(hh-eye,d));if(an>high)high=an;}
 angleSamples.push({x:i*viewWidth/(panorama?300:100),ang:high});}
 const q=model.foot;const angles=q.map(p=>{const az=heading(selected,p);let diff=(az-bear+540)%360-180;return diff;});const siteAngle=(siteBearing-bear+540)%360-180,allAngles=[...angles,...enginePoints(BUILDING_BEARING_DEG).flatMap(h=>h.slice(0,4).map(point=>(heading(selected,point)-bear+540)%360-180))],siteInView=Math.abs(siteAngle)<FOV/2&&Math.min(...allAngles)<=FOV/2&&Math.max(...allAngles)>=-FOV/2;const leftAng=Math.max(-FOV/2,Math.min(...allAngles)),rightAng=Math.min(FOV/2,Math.max(...allAngles));let roofAng=toDeg(Math.atan2(roof-eye-D*D/(2*RE),D));let baseAng=toDeg(Math.atan2(base-eye-D*D/(2*RE),D));const low=Math.min(-.5,Math.min(...angleSamples.map(p=>p.ang),baseAng)-.7),high=Math.max(1,Math.max(...angleSamples.map(p=>p.ang),roofAng)+.7),span=clamp(high-low,2,18),mid=(high+low)/2;const minAng=mid-span/2,maxAng=mid+span/2;const px=x=>clamp((x+FOV/2)/FOV*viewWidth,0,viewWidth),py=a=>yNorm(a,minAng,maxAng,12,215);
 // Roof projection is angular; terrain is painted on top, masking any occluded portion.
 const yt=py(roofAng),yb=py(baseAng);const conceptLights=night&&siteInView?hallPoints(BUILDING_BEARING_DEG).flatMap(hall=>[5,7].map(i=>{const point=hall[i],dist=hav(selected,point),angle=(heading(selected,point)-bear+540)%360-180;if(Math.abs(angle)>FOV/2)return '';const lightY=py(toDeg(Math.atan2(base+15*FT-eye-dist*dist/(2*RE),dist)));return `<circle cx="${px(angle)}" cy="${lightY}" r="1.6" fill="#ffe4a3"/>`;})).join(''):'';const halls=hallPoints(BUILDING_BEARING_DEG).map(hall=>{const angles=hall.slice(0,4).map(p=>(heading(selected,p)-bear+540)%360-180);const left=px(Math.min(...angles)),right=px(Math.max(...angles));return `<rect x="${left.toFixed(1)}" y="${yt.toFixed(1)}" width="${Math.max(0,right-left).toFixed(1)}" height="${Math.max(2,yb-yt).toFixed(1)}" fill="${night?'#3c4952':'#a8b4bb'}" stroke="${night?'#56616a':'#3f6f8d'}" stroke-width="1"/>`;}).join('');const equipmentY=height=>py(toDeg(Math.atan2(base+height*FT-eye-D*D/(2*RE),D)));const extras=hallPoints(BUILDING_BEARING_DEG).map(hall=>{const a=(heading(selected,hall[4])-bear+540)%360-180;if(Math.abs(a)>FOV/2)return '';const x=px(a);return `<rect x="${x-2}" y="${equipmentY(62)}" width="4" height="${Math.max(0,yt-equipmentY(62))}" fill="${night?'#394650':'#5d7d94'}"/>`;}).join('')+enginePoints(BUILDING_BEARING_DEG).map(engine=>{const angles=engine.slice(0,4).map(point=>(heading(selected,point)-bear+540)%360-180),left=px(Math.min(...angles)),right=px(Math.max(...angles)),x=px((heading(selected,engine[4])-bear+540)%360-180),top=equipmentY(43);return `<rect x="${left}" y="${top}" width="${Math.max(0,right-left)}" height="${Math.max(0,yb-top)}" fill="${night?'#34424d':'#879ca9'}"/><rect x="${x-1}" y="${equipmentY(75)}" width="2" height="${Math.max(0,top-equipmentY(75))}" fill="${night?'#394650':'#4c6f87'}"/>`;}).join('');const sil='M'+angleSamples.map(p=>p.x.toFixed(1)+' '+py(p.ang).toFixed(1)).join(' L')+` L${viewWidth} ${viewHeight} L0 ${viewHeight} Z`;
 return `<svg data-terrain-y="${angleSamples.map(p=>py(p.ang).toFixed(1)).join(',')}" viewBox="0 0 ${viewWidth} ${viewHeight}" width="${viewWidth}" height="${viewHeight}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${night?'#0a1b37':'#87c9e8'}"/><stop offset="1" stop-color="${night?'#526780':'#d9edf5'}"/></linearGradient><linearGradient id="land" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${night?'#564c48':'#b58c69'}"/><stop offset="1" stop-color="${night?'#292a30':'#705039'}"/></linearGradient></defs><rect width="${viewWidth}" height="${viewHeight}" fill="url(#sky)"/><line x1="0" x2="${viewWidth}" y1="${py(0)}" y2="${py(0)}" stroke="#dae8f9" stroke-opacity=".27" stroke-dasharray="6 6"/><path d="M${px(leftAng)} ${yb} H${px(rightAng)} V${viewHeight} H${px(leftAng)} Z" fill="${night?'#484443':'#a98160'}" ${siteInView&&leftAng<=rightAng?'':'display="none"'}/>${siteInView?halls+extras+conceptLights:''}<path d="${sil}" fill="url(#land)"/><path d="${sil}" fill="none" stroke="#725039" stroke-width="2"/><g ${panorama?'display="none"':''}><line x1="${viewWidth/2}" y1="4" x2="${viewWidth/2}" y2="${viewHeight-4}" stroke="#f5f3c9" stroke-opacity=".5" stroke-dasharray="2 7"/><text x="13" y="22" fill="${night?'#fff':'#193d4d'}" font-size="12" font-weight="700">${Math.round(bear)}° ${azName(bear)} · ${(D/MI).toFixed(2)} mi</text><text x="${viewWidth-12}" y="22" text-anchor="end" fill="${night?'#fff':'#193d4d'}" font-size="12">${siteInView?'Site terrain: '+styleText(model.state):'Site outside view'}</text><text x="${viewWidth-12}" y="${viewHeight-9}" text-anchor="end" font-size="10" fill="#e4f7ed">${night?'Concept fixtures · brightness and glare not calculated':'44° horizontal view · modeled elevation angles'}</text></g></svg>`;
}
function updateSelected(){drawSelection();updateSelectionLabels();if(!dem){model={state:'unknown',visible:0,total:9};updatePropertySummary(model);renderPropertyList();el('profileNote').textContent='Terrain model not yet available';return;}model=classify(selected,true);if(selectedPropertyId)propertyResults.set(selectedPropertyId,model);drawSelection();updateSelectionLabels();updatePropertySummary(model);renderPropertyList();const s=model.state,dist=hav(selected,C),center=model.centerLine;el('profile').innerHTML=profileSVG(center);el('perspective').innerHTML=modelPerspective();el('targetStatus').innerHTML=`<span style="color:${styleColor(s)}">${styleText(s)}</span>`;if(center&&!center.unknown&&Number.isFinite(center.clearance))el('profileNote').textContent=`Roof center ${center.visible?'clears terrain':'Not Visible due to terrain'} · closest clearance: ${(center.clearance/FT).toFixed(1)} ft · ${dist/MI>0.1?(dist/MI).toFixed(2)+' mi':''}`;else el('profileNote').textContent='Not evaluated: missing elevation data along this sight line.';el('perspectiveNote').textContent=el('viewTime').value==='night'?'Concept fixtures at assumed 15 ft; actual visibility and brightness not assessed.':'';
}
function setView(p,label,propertyId=null){if(hav(p,C)<300){el('mapBanner').textContent='Choose a location outside the building footprint.';return;}selected={...p};chosenLabel=label;selectedPropertyId=propertyId;const dist=hav(p,C);el('mapBanner').textContent=`${label} · ${(dist/MI).toFixed(2)} mi · ${Math.round(heading(p,C))}° ${azName(heading(p,C))}`;updateSelected();}
function contourSpacingForZoom(zoom){return zoom<=10?80:zoom<=12?40:zoom<=14?20:10;}
let lastContourSpacing=null,contourZoomTimer=null;
function updateContours(){contours.clearLayers();if(!dem)return;const radius=10.08*MI,rows=400,cols=400;let vals=[],latlonGrid=[];let min=Infinity,max=-Infinity;for(let i=0;i<=rows;i++){const n=radius*(1-2*i/rows);const v=[],ps=[];for(let j=0;j<=cols;j++){const e=radius*(2*j/cols-1),p=shift(C,e,n),z=dem.at(p);v.push(z);ps.push(p);if(Number.isFinite(z)){min=Math.min(min,z);max=Math.max(max,z);}}vals.push(v);latlonGrid.push(ps);}
 const spacing=contourSpacingForZoom(map.getZoom());lastContourSpacing=spacing;let count=0;let saved=[];for(let level=Math.ceil(min/FT/spacing)*spacing;level<=max/FT;level+=spacing){const lines=[];for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){
  const pp=[latlonGrid[i][j],latlonGrid[i][j+1],latlonGrid[i+1][j+1],latlonGrid[i+1][j]],v=[vals[i][j],vals[i][j+1],vals[i+1][j+1],vals[i+1][j]];if(v.some(x=>!Number.isFinite(x)))continue;const hits=[];for(let k=0;k<4;k++){const b=(k+1)%4;const lo=v[k]-level*FT,hi=v[b]-level*FT;if((lo<0&&hi>=0)||(lo>=0&&hi<0)){const t=clamp((level*FT-v[k])/(v[b]-v[k]),0,1);hits.push(between(pp[k],pp[b],t));}}
  if(hits.length>=2){lines.push([latlon(hits[0]),latlon(hits[1])]);if(hits.length===4)lines.push([latlon(hits[2]),latlon(hits[3])]);}}
 if(lines.length){let layer=L.polyline(lines,{color:level%(spacing*2)===0?'#72877e':'#92a49a',weight:level%(spacing*2)===0?1.1:0.7,opacity:.48,interactive:false}).addTo(contours);saved.push({level,lines});count+=lines.length;if(level%(spacing*2)===0&&lines.length>6){const c=lines[Math.floor(lines.length*.43)][0];L.marker(c,{interactive:false,icon:L.divIcon({className:'contour-badge',html:level+' ft',iconSize:[43,16]})}).addTo(contours);}}}
 window.generatedContours=saved;el('loadMsg').innerHTML=`Terrain loaded. ${dem.tiles.size} raster tiles · ${count.toLocaleString()} contour segments.<div class="pbar"><div style="width:100%;background:#42d5a2;height:100%"></div></div>`;
}
async function calculateRings(){if(!dem)return;setStatus('Evaluating visibility...');el('export').disabled=true;let i=0;const B=18;while(i<segments.length){let end=Math.min(i+B,segments.length);for(let j=i;j<end;j++){const o=segments[j];o.vis=classify(o.p).state;o.line.setStyle({color:styleColor(o.vis)});}i=end;await new Promise(done=>setTimeout(done,0));}
 for(const o of points){o.vis=classify(o.p).state;o.marker.setStyle({fillColor:styleColor(o.vis),radius:5.5});o.marker.bindTooltip(`${o.r} mi · Terrain: ${styleText(o.vis)} · Click to look`);}
 propertyResults.clear();for(const prop of RESIDENTIAL_PROPERTIES)propertyResults.set(prop.id,classify(propertyPoint(prop)));
 updatePropertyMarkerStyles();renderPropertyList();el('export').disabled=false;resReady=true;setStatus('Terrain analysis ready','ok');updateSelected();}
async function loadDEM(){if(location.protocol==='file:'){setStatus('Start local server','bad');el('loadMsg').textContent='Do not open the HTML file directly. Run python3 run_server.py and visit http://127.0.0.1:8765';return;}resReady=false;dem=null;propertyResults.clear();setStatus('Loading terrain...');el('export').disabled=true;el('recompute').disabled=true;el('loadMsg').textContent='Connecting to public elevation rasters...';el('propertyState').textContent='Calculating...';el('propertyState').style.color='';updatePropertySummary({state:'unknown',visible:0,total:9});updatePropertyMarkerStyles();try{const m=new Terrain(Number(el('res').value));await m.load(C,ANALYSIS_RADIUS_M);dem=m;updateContours();await calculateRings();el('recompute').disabled=false;}catch(err){console.error(err);dem=null;setStatus('Elevation unavailable','bad');el('loadMsg').innerHTML=`<b>Could not load elevation tiles.</b><br>${String(err.message).replaceAll('<','&lt;')}<p>Check your connection and press Recalculate. No classifications are shown without elevation data.</p>`;el('recompute').disabled=false;model={state:'unknown',visible:0,total:9};updatePropertySummary(model);el('profile').innerHTML='<svg viewBox="0 0 600 230"><text x="22" y="110" fill="#faadb0">Terrain unavailable. Check internet and retry.</text></svg>';el('perspective').innerHTML=el('profile').innerHTML;}}
function downloadBlob(filename,contents,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([contents],{type}));a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);}
function exportKML(){if(!dem||!resReady)return;const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;');const cstr=p=>`${p.lon.toFixed(8)},${p.lat.toFixed(8)},0`;const ringColor=s=>{const v=styleColor(s).slice(1);return 'ff'+v.slice(4)+v.slice(2,4)+v.slice(0,2)};let out=['<?xml version="1.0" encoding="UTF-8"?>','<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Data center residential visibility</name>','<description>Preliminary terrain-based roof visibility samples. Vegetation, nearby buildings, landscaping, atmospheric visibility, and verified slab elevation are not modeled.</description>'];for(const st of ['clear','partial','blocked','unknown'])out.push(`<Style id="${st}"><LineStyle><color>${ringColor(st)}</color><width>5</width></LineStyle></Style>`);
 out.push('<Style id="residence"><IconStyle><scale>1.1</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/homegardenbusiness.png</href></Icon></IconStyle></Style>','<Style id="contour"><LineStyle><color>aa906b33</color><width>1</width></LineStyle></Style>','<Style id="yellow"><LineStyle><color>ff00cfff</color><width>3</width></LineStyle><PolyStyle><color>6600abff</color></PolyStyle></Style>');
 const mark=(name,p,style='')=>`<Placemark><name>${esc(name)}</name>${style?`<styleUrl>#${style}</styleUrl>`:''}<Point><coordinates>${cstr(p)}</coordinates></Point></Placemark>`;
 out.push(mark('Project Site',C));
 out.push('<Folder><name>Residential properties</name>');
 for(const prop of RESIDENTIAL_PROPERTIES)out.push(mark(prop.label,propertyPoint(prop),'residence'));
 out.push('</Folder><Folder><name>Visibility classified by terrain</name>');
 for(const item of segments){const pts=[move(C,item.r*MI,item.a),move(C,item.r*MI,(item.a+item.b)/2),move(C,item.r*MI,item.b)],state=item.vis||'unknown';out.push(`<Placemark><name>${item.r} mi - ${styleText(state)}</name><styleUrl>#${state}</styleUrl><LineString><tessellate>1</tessellate><coordinates>${pts.map(cstr).join(' ')}</coordinates></LineString></Placemark>`);}
 out.push('</Folder><Folder><name>Approximate data halls</name>');buildingShape.forEach((shape,index)=>out.push(`<Placemark><name>DH-${index+1}</name><styleUrl>#yellow</styleUrl><Polygon><outerBoundaryIs><LinearRing><coordinates>${[...shape,shape[0]].map(cstr).join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`));out.push('</Folder><Folder><name>Approximate engine halls</name>');enginePoints(BUILDING_BEARING_DEG).forEach((engine,index)=>{const shape=engine.slice(0,4);out.push(`<Placemark><name>G${index+1} - 43 ft roof, 75 ft stack</name><styleUrl>#yellow</styleUrl><Polygon><outerBoundaryIs><LinearRing><coordinates>${[...shape,shape[0]].map(cstr).join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`);});out.push('</Folder>');
 out.push('<Folder><name>Elevation contour lines (feet)</name>');for(const group of (window.generatedContours||[])){let value=[];for(const lines of group.lines){if(lines.some(p=>!Number.isFinite(p[0])||!Number.isFinite(p[1])))continue;const coords=lines.map(p=>p[1].toFixed(7)+','+p[0].toFixed(7)+',0');if(new Set(coords).size<2)continue;value.push(`<LineString><tessellate>1</tessellate><coordinates>${coords.join(' ')}</coordinates></LineString>`);}if(value.length)out.push(`<Placemark><name>${group.level} ft</name><styleUrl>#contour</styleUrl><MultiGeometry>${value.join('')}</MultiGeometry></Placemark>`);}out.push('</Folder></Document></kml>');downloadBlob('Data_Center_Residential_Visibility.kml',out.join('\n'),'application/vnd.google-earth.kml+xml');}
el('recompute').onclick=async()=>{
 el('recompute').disabled=true;el('export').disabled=true;resReady=false;
 const spacing=el('ringSpacing').value;RADII=spacing==='standard'?[.5,1,1.5,2,3,5,7]:Array.from({length:Math.floor(8/Number(spacing))},(_,i)=>Number(((i+1)*Number(spacing)).toFixed(2)));ringSampleCount=Number(el('ringSamples').value);
 buildRings();drawBuilding();
 try{if(!dem||Number(el('res').value)!==dem.z)await loadDEM();else{updateContours();await calculateRings();}}catch(error){console.error(error);setStatus('Calculation unavailable','bad');}finally{el('recompute').disabled=false;}
};
el('export').onclick=exportKML;
el('eye').oninput=()=>{el('eyeOut').textContent=el('eye').value+' ft';if(dem)setStatus('Click Recalculate to update view');};
el('res').onchange=()=>{el('resolutionOut').textContent=el('res').value==='14'?'Higher detail':'Standard';setStatus('Click Recalculate to load detail');};
map.on('zoomend',()=>{clearTimeout(contourZoomTimer);if(dem&&contourSpacingForZoom(map.getZoom())!==lastContourSpacing)contourZoomTimer=setTimeout(()=>{if(dem&&contourSpacingForZoom(map.getZoom())!==lastContourSpacing)updateContours();},200);});
el('sidebarToggle').onclick=()=>{
 const sidebar=el('sidebar'),collapsed=!sidebar.hidden;
 sidebar.hidden=collapsed;
 el('layout').classList.toggle('sidebar-collapsed',collapsed);
 el('sidebarToggle').setAttribute('aria-expanded',String(!collapsed));
 map.invalidateSize({pan:false});
};
map.on('click',e=>{const p={lat:e.latlng.lat,lon:e.latlng.lng};if(hav(C,p)>ANALYSIS_RADIUS_M-0.1*MI){el('mapBanner').textContent='Beyond loaded terrain. Choose a closer point.';return;}setView(p,'Custom map point');});
const videoPoint={lat:48.3846,lon:-103.4507};
const videoBearing=L.polyline([latlon(videoPoint),latlon(C)],{color:'#6657a4',weight:2,dashArray:'5 7',opacity:.7,interactive:false}).addTo(map).bindTooltip('Approximate bearing to site');
el('showVideoLocation').onclick=()=>{map.setView(videoLocation.getLatLng(),Math.max(map.getZoom(),15));videoLocation.openPopup();};
el('openOverlay').onclick=()=>el('overlayDialog').showModal();
el('closeOverlay').onclick=()=>el('overlayDialog').close();
el('frameSelect').oninput=()=>{const n=Number(el('frameSelect').value);el('siteFrame').src=`./video-frames/frame-${String(n).padStart(2,'0')}.jpg`;el('frameLabel').textContent=`Frame near ${Math.min(34,4*n-2)} seconds`;};
const resizeHandle=el('analysisResize'),work=el('layout').querySelector('.work'),drawer=work.querySelector('.analysis-drawer');
function setAnalysisHeight(height){const max=Math.max(220,work.clientHeight-150);const h=clamp(Math.round(height),220,max);el('layout').style.setProperty('--analysis-height',h+'px');resizeHandle.setAttribute('aria-valuemax',String(max));resizeHandle.setAttribute('aria-valuenow',String(h));}
resizeHandle.addEventListener('pointerdown',e=>{if(!drawer.open)return;e.preventDefault();const startY=e.clientY,startHeight=drawer.getBoundingClientRect().height;resizeHandle.setPointerCapture(e.pointerId);const move=e=>setAnalysisHeight(startHeight+startY-e.clientY);const end=()=>{resizeHandle.removeEventListener('pointermove',move);resizeHandle.removeEventListener('pointerup',end);resizeHandle.removeEventListener('pointercancel',end);};resizeHandle.addEventListener('pointermove',move);resizeHandle.addEventListener('pointerup',end);resizeHandle.addEventListener('pointercancel',end);});
resizeHandle.addEventListener('keydown',e=>{if(e.key!=='ArrowUp'&&e.key!=='ArrowDown')return;e.preventDefault();setAnalysisHeight(drawer.getBoundingClientRect().height+(e.key==='ArrowUp'?20:-20));});
selectProperty(DEFAULT_PROPERTY_ID);loadDEM();

function exportChart(id, filename){
 const svg=el(id).querySelector('svg');
 if(!svg)return;
 const copy=svg.cloneNode(true);
 copy.setAttribute('xmlns','http://www.w3.org/2000/svg');
 const viewBox=copy.viewBox.baseVal;if(viewBox.width&&viewBox.height){copy.setAttribute('width',viewBox.width);copy.setAttribute('height',viewBox.height);}copy.setAttribute('preserveAspectRatio','xMidYMid meet');
 downloadBlob(filename,new XMLSerializer().serializeToString(copy),'image/svg+xml');
}
el('exportView').onclick=()=>exportChart('perspective','modeled-view.svg');
el('exportProfile').onclick=()=>exportChart('profile','terrain-profile.svg');

// Export the current map viewport, including only enabled map layers.
async function exportMapOrSlides(slides=false){
 const button=el(slides?'exportSlides':'exportMapImage');button.disabled=true;button.textContent='Preparing…';
 const hiddenForExport=[sight,autoRouteLine,otherRoadLayer].filter(layer=>layer&&map.hasLayer(layer));hiddenForExport.forEach(layer=>map.removeLayer(layer));
 const projectRoadStyles=[];if(map.hasLayer(driveLayer))driveLayer.eachLayer(line=>{if(line.options?.color==='#c83d3d'){projectRoadStyles.push({line,weight:line.options.weight});line.setStyle({weight:5.5});}});
 const ringStyles=map.hasLayer(ringLines)?segments.map(({line})=>({line,weight:line.options.weight,opacity:line.options.opacity})):[];ringStyles.forEach(({line})=>line.setStyle({weight:3.5,opacity:.48}));
 try{
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const size=map.getSize(), mapRect=el('map').getBoundingClientRect(), canvas=document.createElement('canvas');
  const groups=[];const features=[],visibility=[],roads=[];
  if(map.hasLayer(residentialLayer))features.push(['house','Residential property']);
  if(map.hasLayer(building))features.push(['#718fa2','Data center buildings']);
  if(map.hasLayer(ownerParcels))features.push(['#378fc9','Berger Property']);
  if(map.hasLayer(contours))features.push(['#8ca79b','Terrain contours']);
  const usedStates=new Set();if(map.hasLayer(ringLines))for(const item of segments)usedStates.add(item.vis||'unknown');if(map.hasLayer(viewpoints))for(const item of points)usedStates.add(item.vis||'unknown');for(const state of ['clear','partial','blocked'])if(usedStates.has(state))visibility.push([styleColor(state),styleText(state)]);
  if(map.hasLayer(driveLayer))roads.push(['#c83d3d','Project Usage: 129th Ave NW'],['#c83d3d','Project Usage: 67th St NW'],['#276bb1','Highway 2'],['#276bb1','133rd Ave NW'],['#276bb1','Other 129th Ave NW']);
  if(features.length)groups.push(['Map features',features]);if(visibility.length)groups.push(['Terrain visibility',visibility]);if(roads.length)groups.push(['Roads',roads]);
  const columns=size.x>=500?2:1;const sectionHeight=items=>26+Math.ceil(items.length/columns)*22;const legendHeight=78+groups.reduce((sum,[,items])=>sum+sectionHeight(items),0);
  canvas.width=size.x*2;canvas.height=(size.y+legendHeight)*2;const ctx=canvas.getContext('2d');ctx.scale(2,2);
  ctx.fillStyle='#e4e9df';ctx.fillRect(0,0,size.x,size.y+legendHeight);
  ctx.save();ctx.beginPath();ctx.rect(0,0,size.x,size.y);ctx.clip();
  const base=map.hasLayer(sat)?sat:topo;
  for(const tile of base.getContainer().querySelectorAll('img.leaflet-tile')){
   if(!tile.complete||!tile.naturalWidth)throw new Error('Map tiles are still loading. Please try again.');
   const r=tile.getBoundingClientRect();ctx.drawImage(tile,r.left-mapRect.left,r.top-mapRect.top,r.width,r.height);
  }
  for(const layerCanvas of el('map').querySelectorAll('.leaflet-overlay-pane canvas')){
   const r=layerCanvas.getBoundingClientRect();ctx.drawImage(layerCanvas,r.left-mapRect.left,r.top-mapRect.top,r.width,r.height);
  }
  if(map.hasLayer(residentialLayer)){const center=map.latLngToContainerPoint(latlon(C));for(const prop of RESIDENTIAL_PROPERTIES){const p=map.latLngToContainerPoint(latlon(prop));ctx.save();ctx.strokeStyle='rgba(35,76,101,.45)';ctx.lineWidth=1.3;ctx.setLineDash([4,6]);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(center.x,center.y);ctx.stroke();ctx.restore();}}
  if(map.hasLayer(residentialLayer))for(const prop of RESIDENTIAL_PROPERTIES){
   const p=map.latLngToContainerPoint(latlon(prop));ctx.save();ctx.translate(p.x,p.y);ctx.fillStyle='#fff';ctx.strokeStyle='#173c31';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,14,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#174d39';ctx.beginPath();ctx.moveTo(-9,-1);ctx.lineTo(0,-9);ctx.lineTo(9,-1);ctx.lineTo(7,-1);ctx.lineTo(7,8);ctx.lineTo(2,8);ctx.lineTo(2,2);ctx.lineTo(-2,2);ctx.lineTo(-2,8);ctx.lineTo(-7,8);ctx.lineTo(-7,-1);ctx.fill();ctx.restore();
  }
  if(map.hasLayer(viewpoints))for(const r of RADII){const p=map.latLngToContainerPoint(latlon(move(C,r*MI,25)));ctx.font='bold 11px sans-serif';const label=r+' mi',w=ctx.measureText(label).width;ctx.fillStyle='#183b30';ctx.fillRect(p.x+5,p.y-2,w+10,19);ctx.fillStyle='#fff';ctx.fillText(label,p.x+10,p.y+12);}
  if(map.hasLayer(building)&&ownerParcels.getLayers().length){
   // Place the entire wrapped label inside the union of the mapped property polygons.
   const mask=document.createElement('canvas');mask.width=size.x;mask.height=size.y;const m=mask.getContext('2d',{willReadFrequently:true});m.fillStyle='#000';
   ownerParcels.eachLayer(layer=>{const geom=layer.feature?.geometry;if(!geom)return;const polygons=geom.type==='Polygon'?[geom.coordinates]:geom.type==='MultiPolygon'?geom.coordinates:[];for(const polygon of polygons){m.beginPath();for(const ring of polygon){ring.forEach(([lon,lat],i)=>{const p=map.latLngToContainerPoint([lat,lon]);if(i===0)m.moveTo(p.x,p.y);else m.lineTo(p.x,p.y);});m.closePath();}m.fill('evenodd');}});
   const pixels=m.getImageData(0,0,size.x,size.y).data,p=map.latLngToContainerPoint(latlon(C));let box=null;
   const footprintPixels=(buildingShape||[]).flat().map(point=>map.latLngToContainerPoint(latlon(point)));const bounds=footprintPixels.length?{left:Math.min(...footprintPixels.map(q=>q.x))-6,right:Math.max(...footprintPixels.map(q=>q.x))+6,top:Math.min(...footprintPixels.map(q=>q.y))-6,bottom:Math.max(...footprintPixels.map(q=>q.y))+6}:null;
   for(const layout of [{w:66,h:38,font:12,lines:['Project','Site']},{w:58,h:34,font:10,lines:['Project','Site']}]){for(let radius=0;radius<=180&&!box;radius+=8)for(let dy=-radius;dy<=radius&&!box;dy+=8)for(let dx=-radius;dx<=radius&&!box;dx+=8){if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;const x=Math.round(p.x+dx-layout.w/2),y=Math.round(p.y+dy-layout.h/2);if(x<1||y<1||x+layout.w>=size.x||y+layout.h>=size.y)continue;if(bounds&&x<bounds.right&&x+layout.w>bounds.left&&y<bounds.bottom&&y+layout.h>bounds.top)continue;let fits=true;for(let yy=y;yy<y+layout.h&&fits;yy++)for(let xx=x;xx<x+layout.w;xx++)if(pixels[(yy*size.x+xx)*4+3]!==255){fits=false;break;}if(fits)box={...layout,x,y};}if(box)break;}
   if(box){ctx.save();ctx.fillStyle='rgba(255,255,255,.96)';ctx.strokeStyle='#315c7a';ctx.lineWidth=1;ctx.fillRect(box.x,box.y,box.w,box.h);ctx.strokeRect(box.x+.5,box.y+.5,box.w-1,box.h-1);ctx.fillStyle='#173b50';ctx.font=`bold ${box.font}px sans-serif`;ctx.textAlign='center';const lineHeight=box.font+2,top=box.y+(box.h-box.lines.length*lineHeight)/2+box.font;box.lines.forEach((line,i)=>ctx.fillText(line,box.x+box.w/2,top+i*lineHeight));ctx.restore();}
  }
  if(map.hasLayer(driveLayer)){for(const [roadName,number,color] of [['67TH ST NW','67','#c83d3d'],['129TH AVE NW','129','#c83d3d'],['133RD AVE NW','133','#276bb1'],['HIGHWAY 2','US 2','#276bb1']]){const candidates=driveRoads.filter(r=>r.name===roadName).flatMap(r=>r.points).map(point=>map.latLngToContainerPoint(latlon(point))).filter(p=>p.x>=25&&p.x<size.x-25&&p.y>=30&&p.y<size.y-25);if(!candidates.length)continue;const center=map.latLngToContainerPoint(latlon(C));candidates.sort((a,b)=>a.distanceTo(center)-b.distanceTo(center));const p=candidates[0];ctx.save();ctx.translate(p.x,p.y-17);ctx.fillStyle='#fff';ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-17,-13);ctx.lineTo(17,-13);ctx.lineTo(17,4);ctx.lineTo(0,14);ctx.lineTo(-17,4);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#183b50';ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.fillText(number,0,3);ctx.restore();}}
  if(map.hasLayer(residentialLayer)){
   const placed=[];ctx.font='bold 13px sans-serif';
   for(const prop of RESIDENTIAL_PROPERTIES){const p=map.latLngToContainerPoint(latlon(prop));if(p.x<0||p.x>size.x||p.y<0||p.y>size.y)continue;const label=prop.label+' · '+(hav(prop,C)/MI).toFixed(2)+' mi',w=ctx.measureText(label).width+18,h=25;
    const candidates=[[p.x+19,p.y-30],[p.x+19,p.y+8],[p.x-w-19,p.y-30],[p.x-w-19,p.y+8]];let pos=candidates.find(([x,y])=>x>=2&&y>=2&&x+w<=size.x-2&&y+h<=size.y-2&&!placed.some(r=>x<r.x+r.w+4&&x+w+4>r.x&&y<r.y+r.h+4&&y+h+4>r.y));if(!pos)pos=[clamp(p.x+19,2,Math.max(2,size.x-w-2)),clamp(p.y-30,2,Math.max(2,size.y-h-2))];const [x,y]=pos;placed.push({x,y,w,h});ctx.fillStyle='#fff';ctx.strokeStyle='#234b60';ctx.lineWidth=1.3;ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);ctx.fillStyle='#173b50';ctx.fillText(label,x+9,y+17);
   }
  }
  ctx.restore();ctx.fillStyle='#fff';ctx.fillRect(0,size.y,size.x,legendHeight);ctx.fillStyle='#203c31';ctx.font='bold 15px sans-serif';ctx.fillText('Map legend',16,size.y+23);
  let legendY=size.y+31;for(const [title,items] of groups){ctx.fillStyle='#52695d';ctx.font='bold 12px sans-serif';ctx.fillText(title,16,legendY+15);legendY+=26;ctx.font='12px sans-serif';items.forEach(([color,label],i)=>{const x=16+(i%columns)*(size.x-32)/columns,y=legendY+Math.floor(i/columns)*22;if(color==='house'){ctx.fillStyle='#174d39';ctx.beginPath();ctx.moveTo(x,y-5);ctx.lineTo(x+7,y-12);ctx.lineTo(x+14,y-5);ctx.lineTo(x+12,y-5);ctx.lineTo(x+12,y+1);ctx.lineTo(x+8,y+1);ctx.lineTo(x+8,y-3);ctx.lineTo(x+5,y-3);ctx.lineTo(x+5,y+1);ctx.lineTo(x+2,y+1);ctx.lineTo(x+2,y-5);ctx.closePath();ctx.fill();}else{ctx.fillStyle=color;ctx.fillRect(x,y-9,14,10);}ctx.fillStyle='#203c31';ctx.fillText(label,x+21,y,Math.max(30,(size.x-32)/columns-27));});legendY+=Math.ceil(items.length/columns)*22;}
  ctx.fillStyle='#40594d';ctx.font='11px sans-serif';ctx.fillText(map.hasLayer(sat)?'Basemap © Esri World Imagery':'Basemap © Esri / contributors',16,size.y+legendHeight-9);
  if(slides){await exportSlideDeck(canvas);}else{const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Image could not be created.')),'image/png'));const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='visibility-map.png';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);}
 }catch(error){console.error(error);alert('Could not export map image: '+error.message);}
 finally{projectRoadStyles.forEach(({line,weight})=>line.setStyle({weight}));ringStyles.forEach(({line,weight,opacity})=>line.setStyle({weight,opacity}));hiddenForExport.forEach(layer=>map.addLayer(layer));button.disabled=false;button.textContent=slides?'Export slides':'Export map image';}
}
el('exportMapImage').onclick=()=>exportMapOrSlides(false);
el('exportSlides').onclick=()=>exportMapOrSlides(true);

// Road segments come from Williams County GIS; the animation looks toward the site.
const otherRoadLayer=L.layerGroup().addTo(driveLayer);
const driveRoads=[];
const CONSTRUCTION_ROADS=new Set(['129TH AVE NW','67TH ST NW','HIGHWAY 2']);
const NEIGHBOR_ROAD='133RD AVE NW';
// 129th Avenue is highlighted only between its mapped Highway 2 and 67th Street crossings.
const ROUTE_SOUTH_LAT=48.34231,ROUTE_NORTH_LAT=48.38726;
function clipRoadLatitude(points,south,north){const parts=[];let part=[];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],delta=b.lat-a.lat;let lo=0,hi=1;if(Math.abs(delta)<1e-12){if(a.lat<south||a.lat>north){if(part.length>1)parts.push(part);part=[];continue;}}else{const t1=(south-a.lat)/delta,t2=(north-a.lat)/delta;lo=Math.max(0,Math.min(t1,t2));hi=Math.min(1,Math.max(t1,t2));if(lo>hi){if(part.length>1)parts.push(part);part=[];continue;}}const p=between(a,b,lo),q=between(a,b,hi);if(!part.length)part.push(p);part.push(q);if(hi<1){if(part.length>1)parts.push(part);part=[];}}if(part.length>1)parts.push(part);return parts;}
let driveMarker=null,driveOriginal=null,driveMiniMap=null,driveMiniMarker=null;
function setupDriveMiniMap(road){
 if(!driveMiniMap){driveMiniMap=L.map('driveMap',{zoomControl:false,dragging:false,scrollWheelZoom:false,doubleClickZoom:false,boxZoom:false,keyboard:false,tap:false,attributionControl:true});L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',{maxZoom:18,attribution:'© Esri / contributors'}).addTo(driveMiniMap);}
 if(driveMiniMap.routeLayer)driveMiniMap.removeLayer(driveMiniMap.routeLayer);
 if(driveMiniMarker)driveMiniMap.removeLayer(driveMiniMarker);
 driveMiniMap.routeLayer=L.featureGroup().addTo(driveMiniMap);L.polyline(road.points.map(latlon),{color:'#6b4bb5',weight:4,opacity:1}).addTo(driveMiniMap.routeLayer);
 L.circleMarker(latlon(C),{radius:5,color:'#fff',weight:2,fillColor:'#e0a321',fillOpacity:1}).addTo(driveMiniMap.routeLayer);
 driveMiniMarker=L.marker(latlon(road.points[0]),{interactive:false,icon:L.divIcon({className:'drive-car-icon',html:'<span></span>',iconSize:[16,20],iconAnchor:[8,10]})}).addTo(driveMiniMap);
 driveMiniMap.invalidateSize();driveMiniMap.fitBounds(L.latLngBounds([...road.points.map(latlon),latlon(C)]),{padding:[15,15],maxZoom:15});
}
function updateDriveMiniMap(point,bearing){if(!driveMiniMarker)return;driveMiniMarker.setLatLng(latlon(point));const icon=driveMiniMarker.getElement()?.firstElementChild;if(icon)icon.style.transform=`rotate(${bearing}deg)`;}

let driveReverse=false,driveRun=0,driveVideo=null;
fetch('./roads.geojson').then(r=>{if(!r.ok)throw new Error('Road data unavailable');return r.json();}).then(data=>{
 for(const feature of data.features){
  const geometry=feature.geometry, paths=geometry.type==='LineString'?[geometry.coordinates]:geometry.type==='MultiLineString'?geometry.coordinates:[];
  for(const path of paths){if(path.length<2)continue;const points=path.map(([lon,lat])=>({lat,lon}));const distance=Math.min(...points.map(p=>hav(p,C)));
   const name=feature.properties.FULL_NAME||'Unnamed road';const dotted=name===NEIGHBOR_ROAD||name==='HIGHWAY 2'||name==='129TH AVE NW';
   L.polyline(points.map(latlon),{color:dotted?'#276bb1':'#a1aab1',weight:2,opacity:.6,dashArray:null}).addTo(dotted?driveLayer:otherRoadLayer).bindTooltip(name===NEIGHBOR_ROAD?name+' · neighbor’s road (excluded from proposed route)':name);
   const relevant=name==='129TH AVE NW'?clipRoadLatitude(points,ROUTE_SOUTH_LAT,ROUTE_NORTH_LAT):name==='67TH ST NW'?[points]:[];
   driveRoads.push({name,points,distance});
   for(const section of relevant){L.polyline(section.map(latlon),{color:'#c83d3d',weight:4,opacity:.9}).addTo(driveLayer).bindTooltip(name+' · proposed route');}

  }
 }
 const select=el('driveRoad');select.replaceChildren();driveRoads.map((r,i)=>({r,i})).filter(({r})=>CONSTRUCTION_ROADS.has(r.name)).sort((a,b)=>a.r.distance-b.r.distance).forEach(({r,i})=>{const option=document.createElement('option');option.value=i;option.textContent=`${r.name} · ${(r.distance/MI).toFixed(1)} mi from site`;select.appendChild(option);});
 if(!select.options.length)throw new Error('Proposed route roads unavailable');el('driveReverse').disabled=false;initializeAutoRoute();updateDriveEndpoints();
}).catch(error=>{console.error(error);el('driveRoad').replaceChildren(new Option('Road data unavailable',''));el('driveRouteStatus').textContent='Road data unavailable. Refresh the page to try again.';el('drivePlay').disabled=true;});
function drivePosition(points,t){const lengths=[];let total=0;for(let i=1;i<points.length;i++){const len=hav(points[i-1],points[i]);lengths.push(len);total+=len;}let d=t*total;for(let i=0;i<lengths.length;i++){if(d<=lengths[i]||i===lengths.length-1)return between(points[i],points[i+1],lengths[i]?clamp(d/lengths[i],0,1):0);d-=lengths[i];}return points[0];}
// Illustrative road follows the mapped route ahead in the panorama's angular coordinates.
function drawDriveRoad(ctx,point,bearing,ahead,night,terrainY){
 const samples=[{x:1110,y:235,width:260}];
 for(const target of ahead){const d=hav(point,target);if(d<2)continue;const angle=(heading(point,target)-bearing+540)%360-180;if(Math.abs(angle)>85)break;const x=1110+angle/180*2220,index=clamp(x/2220*(terrainY.length-1),0,terrainY.length-1),lo=Math.floor(index),hi=Math.min(lo+1,terrainY.length-1),horizon=lerp(terrainY[lo],terrainY[hi],index-lo),y=horizon+(235-horizon)*45/(d+45),width=Math.max(3,260*45/(d+45));samples.push({x,y,width});}
 if(samples.length<2)return;
 ctx.save();ctx.beginPath();samples.forEach((p,i)=>i?ctx.lineTo(p.x-p.width,p.y):ctx.moveTo(p.x-p.width,p.y));for(let i=samples.length-1;i>=0;i--)ctx.lineTo(samples[i].x+samples[i].width,samples[i].y);ctx.closePath();ctx.fillStyle=night?'#242a30':'#343b3d';ctx.fill();ctx.strokeStyle=night?'#f1e9cc':'#fffbed';ctx.lineWidth=4;for(const side of [-1,1]){ctx.beginPath();samples.forEach((p,i)=>i?ctx.lineTo(p.x+side*p.width,p.y):ctx.moveTo(p.x+side*p.width,p.y));ctx.stroke();}ctx.strokeStyle='#ffdf62';ctx.lineWidth=3;ctx.setLineDash([8,6]);ctx.beginPath();samples.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();ctx.restore();
}
async function driveFrame(point,road,distanceMiles,totalMiles,speedLabel,travelBearing,ahead){
 const canvas=el('driveCanvas'),frame=document.createElement('canvas');frame.width=canvas.width;frame.height=canvas.height;const ctx=frame.getContext('2d');ctx.fillStyle='#b9dfee';ctx.fillRect(0,0,2220,280);
 updateDriveMiniMap(point,travelBearing);if(driveMarker)driveMarker.setLatLng(latlon(point));
 const available=dem&&Number.isFinite(dem.at(point))&&hav(point,C)>=300;
 if(available){if(driveMarker)driveMarker.setLatLng(latlon(point));selected={...point};chosenLabel=road;selectedPropertyId=null;model=classify(point,true);
  const svg=modelPerspective(travelBearing,true),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));try{const img=new Image();img.src=url;await img.decode();ctx.drawImage(img,0,0,2220,235);if(!svg.includes('View unavailable')){const terrainMatch=svg.match(/data-terrain-y="([^"]+)"/),terrainY=terrainMatch?terrainMatch[1].split(',').map(Number):[];if(terrainY.length>1&&terrainY.every(Number.isFinite))drawDriveRoad(ctx,point,travelBearing,ahead,el('viewTime').value==='night',terrainY);}}finally{URL.revokeObjectURL(url);}
 }else{ctx.fillStyle='#263e47';ctx.font='18px sans-serif';ctx.fillText('Not evaluated at this location',24,110);}
 ctx.fillStyle='#203d33';ctx.fillRect(0,235,2220,45);ctx.fillStyle='#fff';ctx.font='bold 18px sans-serif';ctx.fillText(`${road} · ${distanceMiles.toFixed(2)} / ${totalMiles.toFixed(2)} mi · ${speedLabel} · 180° view`,20,263);
 canvas.getContext('2d').drawImage(frame,0,0);
}
let driveSeekPending=null,drivePlaying=false,driveRouteChecks=null;
async function playDrive(from=0){
 if(!dem){el('driveStatus').textContent='Wait for terrain to load before playing.';return;}
 const road=autoDriveRoute;if(!road)return;drivePlaying=true;driveSeekPending=null;const run=++driveRun,points=road.points,start=Number(el('driveStart').value)/100,end=Number(el('driveEnd').value)/100;if(start===end){drivePlaying=false;el('driveStatus').textContent='Choose different start and end points.';return;}driveVideo=null;el('driveDownload').disabled=true;el('driveReplay').disabled=true;el('driveTitle').textContent='';el('driveRouteHeading').textContent=road.name;el('driveStatus').textContent='Playing terrain-only illustration…';
 try{const radius=Math.max(ANALYSIS_RADIUS_M,...points.map(p=>2*hav(p,C)+500));el('driveStatus').textContent='Loading terrain for this route…';await dem.load(C,radius);if(run!==driveRun)return;}catch(error){console.error(error);el('driveStatus').textContent='Some terrain is unavailable; affected views will be marked not evaluated.';}
 const routeLength=points.slice(1).reduce((sum,p,i)=>sum+hav(points[i],p),0)*Math.abs(end-start),bearingWindow=Math.min(.5,25/Math.max(routeLength,1));
 if(!driveRouteChecks||driveRouteChecks.road!==road||driveRouteChecks.eye!==el('eye').value){
  el('driveSeek').disabled=true;el('driveSegments').replaceChildren();el('driveStatus').textContent='Checking where the site may be visible…';
  const count=Math.max(1,Math.ceil(routeLength/(0.1*MI))),fragment=document.createDocumentFragment();
  for(let i=0;i<count;i++){if(run!==driveRun)return;const t=(i+.5)/count,position=drivePosition(points,lerp(start,end,t)),before=drivePosition(points,lerp(start,end,Math.max(0,t-bearingWindow))),after=drivePosition(points,lerp(start,end,Math.min(1,t+bearingWindow))),bearing=heading(before,after),angle=(heading(position,C)-bearing+540)%360-180;let state='unknown';if(Number.isFinite(dem.at(position))&&hav(position,C)>=300){const result=classify(position);state=result.state==='unknown'?'unknown':Math.abs(angle)<90&&(result.state==='clear'||result.state==='partial')?'visible':'other';}const segment=document.createElement('span');segment.className='drive-'+state;fragment.appendChild(segment);if(i%5===0)await new Promise(resolve=>setTimeout(resolve,0));}
  if(run!==driveRun)return;el('driveSegments').replaceChildren(fragment);driveRouteChecks={road,eye:el('eye').value};
 }
 el('driveSeek').disabled=false;
 let recorder=null,chunks=[];const canvas=el('driveCanvas');
 if(canvas.captureStream&&window.MediaRecorder){try{const stream=canvas.captureStream(15);recorder=new MediaRecorder(stream);recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());if(run===driveRun&&chunks.length){driveVideo=new Blob(chunks,{type:recorder.mimeType});el('driveDownload').disabled=false;}};recorder.start();}catch(error){console.warn('Video recording unavailable',error);}}
 try{const frames=Math.max(1,Math.ceil(routeLength/10));for(let i=Math.round(from*frames);i<=frames&&run===driveRun;i++){if(driveSeekPending!==null){i=Math.round(driveSeekPending*frames);driveSeekPending=null;}const started=performance.now(),t=i/frames,multiplier=Number(el('driveSpeed').value),speed=55*multiplier,speedLabel=multiplier===1?'55 mph simulated':'55 mph simulated · 2.5× visualization';el('driveSeek').value=Math.round(t*1000);el('driveMiles').textContent=`${(t*routeLength/MI).toFixed(2)} / ${(routeLength/MI).toFixed(2)} mi`;el('driveSeek').setAttribute('aria-valuetext',el('driveMiles').textContent);el('driveStatus').textContent=`${(t*routeLength/MI).toFixed(2)} of ${(routeLength/MI).toFixed(2)} mi · ${speedLabel}`;const position=drivePosition(points,lerp(start,end,t)),before=drivePosition(points,lerp(start,end,Math.max(0,t-bearingWindow))),after=drivePosition(points,lerp(start,end,Math.min(1,t+bearingWindow))),bearing=heading(before,after);const ahead=[10,20,35,55,85,130,200,300,500].map(d=>drivePosition(points,lerp(start,end,Math.min(1,t+d/routeLength))));await driveFrame(position,road.name,t*routeLength/MI,routeLength/MI,speedLabel,bearing,ahead);if(i<frames)await new Promise(resolve=>{const timer=setTimeout(done,Math.max(0,(routeLength/frames)/(speed*MI/3600)*1000-(performance.now()-started)));function done(){clearTimeout(timer);el('driveSpeed').removeEventListener('change',done);resolve();}el('driveSpeed').addEventListener('change',done,{once:true});});}if(run===driveRun)el('driveStatus').textContent=recorder?'Finished. Save video or replay.':'Finished. Video saving is not supported by this browser.';}catch(error){console.error(error);if(run===driveRun)el('driveStatus').textContent='The view could not be rendered.';}finally{if(recorder&&recorder.state!=='inactive')recorder.stop();if(run===driveRun){drivePlaying=false;el('driveReplay').disabled=false;}}
}
el('drivePlay').onclick=()=>{driveOriginal={selected,chosenLabel,selectedPropertyId};if(driveMarker)map.removeLayer(driveMarker);driveMarker=L.circleMarker(latlon(selected),{radius:7,color:'#fff',weight:2,fillColor:'#315eaa',fillOpacity:1}).addTo(map);el('driveDialog').showModal();setupDriveMiniMap(autoDriveRoute);playDrive();};
el('driveReplay').onclick=()=>playDrive(0);
el('drivePlayerReverse').onclick=()=>{const progress=Number(el('driveSeek').value)/1000;driveRun++;drivePlaying=false;driveRouteChecks=null;autoPins.reverse();updateAutoRoute();updateDriveEndpoints();if(autoDriveRoute){setupDriveMiniMap(autoDriveRoute);playDrive(1-progress);}};
el('driveSeek').addEventListener('input',e=>{const t=Number(e.target.value)/1000;if(drivePlaying)driveSeekPending=t;else playDrive(t);});
el('driveReverse').onclick=()=>{autoPins.reverse();updateAutoRoute();updateDriveEndpoints();};
el('driveExpand').onclick=()=>{const expanded=el('driveDialog').classList.toggle('expanded');el('driveExpand').setAttribute('aria-pressed',String(expanded));el('driveExpand').textContent=expanded?'Reduce':'Expand';requestAnimationFrame(()=>driveMiniMap?.invalidateSize());};
el('driveClose').onclick=()=>el('driveDialog').close();
el('driveDialog').addEventListener('close',()=>{driveRun++;drivePlaying=false;driveRouteChecks=null;el('driveSeek').disabled=true;el('driveSeek').value=0;el('driveSegments').replaceChildren();if(driveMarker){map.removeLayer(driveMarker);driveMarker=null;}if(driveOriginal){({selected,chosenLabel,selectedPropertyId}=driveOriginal);driveOriginal=null;}if(dem)updateSelected();});
el('driveDownload').onclick=()=>{if(!driveVideo)return;const url=URL.createObjectURL(driveVideo),a=document.createElement('a');a.href=url;a.download='driving-view.webm';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);};


let driveEndpointMarkers=[];
function closestRoadFraction(points,latlng){const p=map.project(latlng),projected=points.map(point=>map.project(latlon(point))),lengths=[];let total=0;for(let i=1;i<points.length;i++){const length=hav(points[i-1],points[i]);lengths.push(length);total+=length;}let best=Infinity,bestDistance=0,prior=0;for(let i=0;i<lengths.length;i++){const a=projected[i],b=projected[i+1],dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1),distance=(p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2;if(distance<best){best=distance;bestDistance=prior+t*lengths[i];}prior+=lengths[i];}return total?bestDistance/total:0;}
function updateDriveEndpoints(){for(const marker of driveEndpointMarkers)map.removeLayer(marker);driveEndpointMarkers=[];if(!el('driveControls').open||!autoPins.length)return;for(let i=0;i<2;i++){const label=i?'B':'A';const marker=L.marker(latlon(autoPins[i]),{draggable:true,icon:L.divIcon({className:'drive-endpoint',html:`<span><b>${label}</b></span>`,iconSize:[38,48],iconAnchor:[19,41]})}).addTo(map);marker.bindTooltip(i?'End':'Start');marker.on('dragend',()=>{autoPins[i]={lat:marker.getLatLng().lat,lon:marker.getLatLng().lng};updateAutoRoute();updateDriveEndpoints();});driveEndpointMarkers.push(marker);}}

let driveHiddenLayers=[];
el('driveControls').addEventListener('toggle',()=>{
 if(el('driveControls').open){driveLayer.addTo(map);if(autoRouteLine)autoRouteLine.addTo(map);driveHiddenLayers=[ringLines,viewpoints,videoLocation,videoBearing].filter(layer=>map.hasLayer(layer));driveHiddenLayers.forEach(layer=>map.removeLayer(layer));el('siteVideoSection').hidden=true;}
 else{map.removeLayer(driveLayer);if(autoRouteLine)map.removeLayer(autoRouteLine);driveHiddenLayers.forEach(layer=>map.addLayer(layer));driveHiddenLayers=[];el('siteVideoSection').hidden=false;}
 updateDriveEndpoints();
});

// Build a local road graph and snap each endpoint to the nearest mapped segment.
let autoPins=[],autoDriveRoute=null,autoRouteLine=null;
function initializeAutoRoute(){const road=driveRoads[Number(el('driveRoad').value)];autoPins=[road.points[0],road.points[road.points.length-1]];updateAutoRoute();}
function updateAutoRoute(){
 const nodes=[],edges=[],nodeIds=new Map();
 function node(p){const key=p.lat.toFixed(5)+','+p.lon.toFixed(5);if(!nodeIds.has(key)){nodeIds.set(key,nodes.length);nodes.push({p,links:[]});}return nodeIds.get(key);}
 function link(a,b,w,name){nodes[a].links.push([b,w,name]);nodes[b].links.push([a,w,name]);}
 const segments=[];for(const road of driveRoads)for(let i=1;i<road.points.length;i++)segments.push({p:road.points[i-1],q:road.points[i],name:road.name,cuts:[0,1]});
 // Split road lines at mapped intersections so crossing segments form a connected network.
 for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){const a=segments[i],b=segments[j],rx=a.q.lon-a.p.lon,ry=a.q.lat-a.p.lat,sx=b.q.lon-b.p.lon,sy=b.q.lat-b.p.lat,den=rx*sy-ry*sx;if(Math.abs(den)<1e-14)continue;const dx=b.p.lon-a.p.lon,dy=b.p.lat-a.p.lat,t=(dx*sy-dy*sx)/den,u=(dx*ry-dy*rx)/den;if(t>=0&&t<=1&&u>=0&&u<=1){a.cuts.push(t);b.cuts.push(u);}}
 for(const segment of segments){const cuts=[...new Set(segment.cuts)].sort((a,b)=>a-b);for(let i=1;i<cuts.length;i++){const a=node(between(segment.p,segment.q,cuts[i-1])),b=node(between(segment.p,segment.q,cuts[i]));if(a===b)continue;const length=hav(nodes[a].p,nodes[b].p);link(a,b,length,segment.name);edges.push({a,b,length,name:segment.name});}}
 const snaps=autoPins.map(pin=>{const q=map.project(latlon(pin),15);let best=null;for(const edge of edges){const a=map.project(latlon(nodes[edge.a].p),15),b=map.project(latlon(nodes[edge.b].p),15),dx=b.x-a.x,dy=b.y-a.y,t=clamp(((q.x-a.x)*dx+(q.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1),dist=(q.x-a.x-t*dx)**2+(q.y-a.y-t*dy)**2;if(!best||dist<best.dist)best={edge,t,dist};}if(!best)return null;const p=between(nodes[best.edge.a].p,nodes[best.edge.b].p,best.t);return {...best,p};});
 if(snaps.some((x,i)=>!x||hav(autoPins[i],x.p)>0.5*MI)){autoDriveRoute=null;el('drivePlay').disabled=true;if(autoRouteLine){map.removeLayer(autoRouteLine);autoRouteLine=null;}el('driveRouteStatus').textContent='Move both pins within half a mile of a mapped road.';return;}
 autoPins=snaps.map(s=>s.p);const start=nodes.length;nodes.push({p:snaps[0].p,links:[]},{p:snaps[1].p,links:[]});snaps.forEach((s,i)=>{link(start+i,s.edge.a,s.edge.length*s.t,s.edge.name);link(start+i,s.edge.b,s.edge.length*(1-s.t),s.edge.name);});if(snaps[0].edge===snaps[1].edge)link(start,start+1,Math.abs(snaps[0].t-snaps[1].t)*snaps[0].edge.length,snaps[0].edge.name);
 const distances=new Float64Array(nodes.length).fill(Infinity),previous=new Int32Array(nodes.length).fill(-1),previousRoad=new Array(nodes.length),visited=new Uint8Array(nodes.length);distances[start]=0;
 for(let count=0;count<nodes.length;count++){let current=-1,best=Infinity;for(let i=0;i<nodes.length;i++)if(!visited[i]&&distances[i]<best){best=distances[i];current=i;}if(current<0||current===start+1)break;visited[current]=1;for(const [next,cost,name] of nodes[current].links)if(best+cost<distances[next]){distances[next]=best+cost;previous[next]=current;previousRoad[next]=name;}}
 if(autoRouteLine){map.removeLayer(autoRouteLine);autoRouteLine=null;}
 if(!Number.isFinite(distances[start+1])){autoDriveRoute=null;el('drivePlay').disabled=true;el('driveRouteStatus').textContent='No connected route found. Try moving a pin to a connected road.';return;}
 const ids=[];for(let at=start+1;at!==-1;at=previous[at])ids.push(at);ids.reverse();const legs=[];for(let i=1;i<ids.length;i++){const name=previousRoad[ids[i]]||'UNNAMED',from=nodes[ids[i-1]].p,to=nodes[ids[i]].p;if(hav(from,to)<0.1)continue;const last=legs[legs.length-1];if(last&&last.name===name)last.to=to;else legs.push({name,from,to});}const direction=b=>['North','Northeast','East','Southeast','South','Southwest','West','Northwest'][Math.round(b/45)%8];const formatRoad=name=>name==='UNNAMED'?'unnamed road':name.toLowerCase().replace(/\b(ave|st|nw|highway)\b/g,m=>({ave:'Ave',st:'St',nw:'NW',highway:'Highway'}[m]));const routeName=legs.length?legs.map(leg=>`${direction(heading(leg.from,leg.to))} on ${formatRoad(leg.name)}`).join(' → '):'Selected road route';autoDriveRoute={name:routeName,points:ids.map(i=>nodes[i].p)};autoRouteLine=L.polyline(autoDriveRoute.points.map(latlon),{color:'#6b4bb5',weight:6,opacity:.95,interactive:false});if(el('driveControls').open)autoRouteLine.addTo(map);el('drivePlay').disabled=false;el('driveRouteStatus').textContent=`Road route: ${(distances[start+1]/MI).toFixed(2)} mi · Drag A or B to change it.`;
}

function setViewTime(value){el('viewTime').value=value;el('driveTime').value=value;if(dem&&model&&!el('driveDialog').open){el('perspective').innerHTML=modelPerspective();el('perspectiveNote').textContent=value==='night'?'Concept fixtures at assumed 15 ft; actual visibility and brightness not assessed.':'';}}
el('viewTime').addEventListener('change',e=>setViewTime(e.target.value));
el('driveTime').addEventListener('change',e=>setViewTime(e.target.value));

// A self-contained, printable slide deck generated from the current analysis.
async function exportSlideDeck(mapCanvas){
 const escapeHTML=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const mapImage=mapCanvas.toDataURL('image/png');
 const original={selected,chosenLabel,selectedPropertyId,model};let residenceSlides='';
 try{
  for(const prop of RESIDENTIAL_PROPERTIES){
   selected=propertyPoint(prop);chosenLabel=prop.label;selectedPropertyId=prop.id;
   const distance=(hav(selected,C)/MI).toFixed(2);let content;
   if(dem){model=classify(selected,true);const visibility=styleText(model.state);content=`<p class="result">${escapeHTML(distance)} miles to site center <span>·</span> Terrain: ${escapeHTML(visibility)}</p><div class="charts"><figure><h2>Modeled view</h2>${modelPerspective()}</figure><figure><h2>Terrain profile</h2>${profileSVG(model.centerLine)}</figure></div>`;}
   else content=`<p class="result">${escapeHTML(distance)} miles to site center <span>·</span> Terrain: No data</p><p>Elevation data is unavailable. No visibility assessment is shown.</p>`;
   residenceSlides+=`<section class="slide"><h1>${escapeHTML(prop.label)}</h1>${content}<p class="note">Preliminary terrain-only model · Trees, nearby buildings and lighting impact are not assessed · Distance is straight-line to site center</p></section>`;
  }
 }finally{({selected,chosenLabel,selectedPropertyId,model}=original);}
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Residential visibility slides</title><style>@page{size:16in 9in;margin:0}*{box-sizing:border-box}body{margin:0;background:#dfe6df;font:20px Arial,sans-serif;color:#183a30}.toolbar{padding:12px 24px;background:#183a30;color:white}.toolbar button{font-size:16px;padding:8px 14px}.slide{position:relative;width:16in;height:9in;margin:20px auto;background:white;padding:.42in .55in .5in;overflow:hidden;page-break-after:always;break-after:page;box-shadow:0 3px 16px #0003}.slide h1{font-size:36px;margin:0 0 12px}.slide h2{font-size:22px;margin:0 0 8px}.slide p{line-height:1.35}.result{font-size:23px;margin:0 0 20px}.result span{color:#819589}.map{width:100%;height:7.35in;object-fit:contain;display:block}.charts{display:grid;grid-template-columns:1fr 1fr;gap:24px}.charts figure{margin:0;min-width:0}.charts svg{display:block;width:100%;height:3.5in}.note{position:absolute;bottom:.18in;left:.55in;right:.55in;font-size:14px;color:#586d62}.toolbar span{margin-left:12px;font-size:14px}@media print{body{background:white}.toolbar{display:none}.slide{margin:0;box-shadow:none}}</style></head><body><div class="toolbar"><button onclick="window.print()">Print or save as PDF</button><span>Use landscape and enable background graphics.</span></div><section class="slide"><h1>Residential visibility · map</h1><img class="map" src="${mapImage}" alt="Map with residences, data center, distance labels and legend"><p class="note">Preliminary terrain-only model · ${map.hasLayer(sat)?'Basemap © Esri World Imagery':'Basemap © Esri / contributors'}</p></section>${residenceSlides}</body></html>`;
 downloadBlob('residential-visibility-slides.html',html,'text/html;charset=utf-8');
}



