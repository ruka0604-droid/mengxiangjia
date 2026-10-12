// 梦想家 · 房子大小、房间种类、加减房间和搬家
import { uid, now } from './util.js?mxj=0.5.7';
import { getHome, setHome } from './settings.js?mxj=0.5.7';
import { CATALOG } from './furniture.js?mxj=0.5.7';
import { recordChanges } from './home-decor.js?mxj=0.5.7';

export const HOUSE_SIZES = [
    { id: 'studio', name: '一间小屋', sub: '开间', rooms: '1 个房间', maxRooms: 4 },
    { id: 'flat', name: '小公寓', sub: '基础五间', rooms: '5 个房间', maxRooms: 8 },
    { id: 'yard', name: '带院子', sub: '庭院住宅', rooms: '5 个房间（含院子）', maxRooms: 10 },
    { id: 'large_flat', name: '大平层', sub: '宽敞单层', rooms: '9 个房间', maxRooms: 12 },
    { id: 'villa', name: '别墅', sub: '多层住宅', rooms: '12 个房间', maxRooms: 16 },
];

// 结构模板只创建房间数据，不生成房屋图片；旧存档无需迁移。
export const ROOM_MODULES = Object.freeze({
    living:'客厅', bedroom:'卧室', kitchen:'厨房', bathroom:'浴室', balcony:'阳台',
    yard:'庭院', dining:'餐厅', study:'书房', dressing:'更衣室', terrace:'露台',
    sunroom:'阳光房', studio:'工作室', gaming:'游戏室', cinema:'影音室',
    garden:'花园', pool:'泳池', gym:'健身房', pet:'宠物房', storage:'储藏室',
});
export const STRUCTURES = {
    studio:['living'], flat:['living','bedroom','kitchen','bathroom','balcony'],
    yard:['living','bedroom','kitchen','bathroom','yard'],
    large_flat:['living','bedroom','bedroom','kitchen','bathroom','dining','study','dressing','balcony'],
    villa:['living','kitchen','dining','bedroom','bedroom','bedroom','bathroom','study','dressing','terrace','yard','sunroom'],
};
// AI 给房间起的名字五花八门（起居室、主卧、小阳台……），按关键词认出它是哪种房间。
const ROOM_HINTS = [
    ['living', /客厅|起居|客餐厅|会客|大厅|堂屋/], ['sunroom', /阳光房|温室/], ['terrace', /露台|天台|屋顶/],
    ['balcony', /阳台/], ['dining', /餐厅|饭厅/], ['kitchen', /厨/], ['bathroom', /浴|卫生间|洗手间|盥洗|淋浴/],
    ['dressing', /衣帽|更衣|衣橱间/], ['bedroom', /卧|寝|睡房/], ['study', /书房|书斋|阅读/],
    ['studio', /工作室|画室|琴房|录音|工坊/], ['gaming', /游戏/], ['cinema', /影音|影院|放映/],
    ['garden', /花园|菜园|苗圃/], ['yard', /院|庭/], ['pool', /泳池|水池/], ['gym', /健身|练功|道场/],
    ['pet', /宠物|猫|狗/], ['storage', /储藏|储物|杂物|仓/],
];
export function roomTypeOf(room) {
    if (room?.type && ROOM_MODULES[room.type]) return room.type;
    const name = String(room?.name || '');
    const exact = Object.keys(ROOM_MODULES).find(k => ROOM_MODULES[k] === name);
    if (exact) return exact;
    return ROOM_HINTS.find(([, rx]) => rx.test(name))?.[0] || '';
}
// 补出来的房间按房间类型放几件合适的家具（厨房不放沙发）
const ROOM_DEFAULTS = {
    living: [['window', 70], ['sofa', 45], ['plant', 88], ['lamp', 12], ['rug', 45]],
    bedroom: [['window', 72], ['bed', 40], ['lamp', 90], ['wardrobe', 12]],
    kitchen: [['window', 62], ['stove', 28], ['fridge', 88], ['plant', 10]],
    bathroom: [['mirror', 30], ['bathtub', 55], ['plant', 90]],
    balcony: [['stringlights', 50], ['plant', 18], ['chair', 52], ['plant', 82]],
    terrace: [['stringlights', 50], ['plant', 15], ['chair', 50], ['plant', 85]],
    yard: [['plant', 12], ['plant', 42], ['chair', 68], ['plant', 90]],
    garden: [['plant', 12], ['plant', 40], ['plant', 70], ['chair', 88]],
    dining: [['window', 70], ['painting', 25], ['diningtable', 48], ['chair', 18], ['chair', 78]],
    study: [['bookshelf', 15], ['window', 72], ['desk', 55], ['chair', 72], ['lamp', 92]],
    dressing: [['wardrobe', 25], ['mirror', 60], ['coatrack', 85]],
    sunroom: [['window', 28], ['window', 74], ['plant', 12], ['sofa', 50], ['plant', 90]],
    studio: [['wallshelf', 40], ['desk', 45], ['chair', 62], ['lamp', 90]],
    gaming: [['tv', 45], ['sofa', 45], ['cushion', 12], ['lamp', 90]],
    cinema: [['tv', 50], ['sofa', 50], ['cushion', 88]],
    pool: [['plant', 12], ['chair', 75], ['plant', 92]],
    gym: [['window', 50], ['mirror', 20], ['plant', 88]],
    pet: [['petbed', 35], ['cushion', 65], ['plant', 90]],
    storage: [['cabinet', 30], ['wardrobe', 70]],
};
export function defaultFurnitureFor(room) {
    const set = ROOM_DEFAULTS[roomTypeOf(room)] || ROOM_DEFAULTS.living;
    return set.map(([type, x]) => ({ id: uid('f'), type, name: CATALOG[type].label, room: room.id, x, color: '', by: 'ai' }));
}

export function roomModulesFromText(text) {
    const value=String(text||''); const result=[];
    for(const [type,name] of Object.entries(ROOM_MODULES)) {
        const pattern=new RegExp('(?:([一二三四五六七八九]|[1-9])(?:间|个))?'+name,'g');
        for(const m of value.matchAll(pattern)) {
            const count=({'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9}[m[1]]||Number(m[1])||1);
            for(let i=0;i<Math.min(count,8);i++)result.push(type);
        }
    }
    return result;
}
export function houseCapacity(size) { return HOUSE_SIZES.find(h=>h.id===size)?.maxRooms ?? 8; }
export function addRoomModules(char, types) {
    const home=getHome(char);if(!home?.house)throw new Error('还没有家');
    const added=[];
    const capacity=houseCapacity(home.house.size);
    const valid=types.filter(type=>ROOM_MODULES[type]);
    if(home.house.rooms.length+valid.length>capacity)throw new Error(`当前住宅最多容纳 ${capacity} 个房间模块，请先升级搬家，或减少新增房间数量`);
    for(const type of valid) {
        const room={id:uid('r'),type,name:ROOM_MODULES[type],note:'',wall:'',floor:'',floorLevel:1};
        home.house.rooms.push(room);added.push(room);
    }
    if(added.length){setHome(char,home);recordChanges(char,[`新增房间：${added.map(r=>r.name).join('、')}`]);}
    return added;
}
export function upgradeHouse(char,size,{extra=''}={}) {
    const home=getHome(char); if(!home?.house)throw new Error('还没有家');
    if(!STRUCTURES[size])throw new Error('不支持的住宅结构');
    const old=home.house.size;
    if(old===size)return [];
    if(houseCapacity(size)<=houseCapacity(old))throw new Error('搬家升级必须选择容量更大的住宅');
    const existing={};
    for(const r of home.house.rooms){const t=roomTypeOf(r);if(t)existing[t]=(existing[t]||0)+1;}
    const missing=[];const seen={};
    for(const type of STRUCTURES[size]){seen[type]=(seen[type]||0)+1;if(seen[type]>(existing[type]||0))missing.push(type);}
    const requested=extra?roomModulesFromText(extra):[];
    if(home.house.rooms.length+missing.length+requested.length>houseCapacity(size))throw new Error('升级后的房间模块超过住宅容量，请减少补充要求');
    // 原子性提交：先在内存中完成全部修改，再保存一次。
    const added=[...missing,...requested].map(type=>({id:uid('r'),type,name:ROOM_MODULES[type],note:'',wall:'',floor:'',floorLevel:1}));
    home.house.rooms.push(...added);
    home.house.size=size;
    home.house.structureHistory||=[];
    home.house.structureHistory.push({from:old,to:size,at:now()});
    home.changes||=[];
    home.changes.push({at:now(),text:`住宅从${HOUSE_SIZES.find(x=>x.id===old)?.name||old}升级为${HOUSE_SIZES.find(x=>x.id===size)?.name||size}；新增${added.map(x=>x.name).join('、')||'无'}房间`});
    setHome(char,home);
    return added;
}

export function removeRoomModule(char,roomId) {
    const home=getHome(char);if(!home?.house)throw new Error('还没有家');
    if(home.house.rooms.length<=1)throw new Error('住宅至少保留一个房间');
    const room=home.house.rooms.find(r=>r.id===roomId);if(!room)throw new Error('找不到房间');
    const furniture=home.house.furniture.filter(f=>f.room===roomId);
    home.house.furniture=home.house.furniture.filter(f=>f.room!==roomId);
    home.house.storage=Array.isArray(home.house.storage)?home.house.storage:[];
    home.house.storage.push(...furniture.map(({room:_room,x:_x,z:_z,...rest})=>({...rest,previousRoom:roomId})));
    home.house.rooms=home.house.rooms.filter(r=>r.id!==roomId);
    if(home.currentRoom===roomId)home.currentRoom=home.house.rooms[0].id;
    home.changes||=[];home.changes.push({at:now(),text:`移除${room.name}模块，${furniture.length}件家具转入仓库`});
    setHome(char,home);return furniture.length;
}
