import {SERVICE_RULES,allowedServices} from './scheduler.js';
export function selectedServices(entry){
  if(entry.kind==='month_morning')return SERVICE_RULES.filter(s=>['IR 1','IR 2'].includes(s.service)&&(entry.location==='Kedua lokasi'||s.location===entry.location)).map(({location,service})=>({location,service}));
  return allowedServices(entry);
}
export function normalizedServices(value){
  if(!Array.isArray(value)||!value.length||value.length>7)throw new Error('Pilih minimal satu ibadah di lokasi yang tersedia.');
  if(value.some(x=>!x||!SERVICE_RULES.some(s=>s.location===x.location&&s.service===x.service)))throw new Error('Pilihan lokasi atau ibadah tidak valid.');
  return SERVICE_RULES.filter(s=>value.some(x=>x.location===s.location&&x.service===s.service)).map(({location,service})=>({location,service}));
}
