// OCR suggestions never authorize stock or financial writes.
export function parseInvoiceText(text) {
  const rows=String(text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const amount=s=>Number(String(s).replace(/\s/g,'').replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',','.'));
  const money=/\d[\d.]*[,\.]\d{2}\b/g;
  const lastAmount=row=>{const found=row.match(money);return found?.length?amount(found.at(-1)):0};
  const totalRow=rows.find(r=>/ödenecek|odenecek|genel toplam|vergiler dahil toplam/i.test(r));
  const vatRow=rows.find(r=>/toplam kdv|kdv toplam|hesaplanan kdv/i.test(r));
  const numberRow=rows.find(r=>/fatura\s*(no|numara)/i.test(r));
  const dateMatch=rows.find(r=>/tarih/i.test(r))?.match(/(\d{2})[./-](\d{2})[./-](\d{4})/);
  const lines=[];
  for(const row of rows){
    // Only confidently structured quantity + unit + price + gross-total rows.
    const match=row.match(/^(?:\d+\s+)?(.+?)\s+(\d+(?:[.,]\d+)?)\s+(adet|ad|koli|paket|kg|lt)\s+([\d.,]+)\s+([\d.,]+)\s*(?:TL|₺)?$/i);
    if(match&&!/toplam|kdv|iskonto|matrah/i.test(match[1]))lines.push({name:match[1],quantity:amount(match[2]),unit:match[3].toLocaleLowerCase('tr-TR'),unitPrice:amount(match[4]),total:amount(match[5]),stock:false,multiplier:1,stockItemId:''});
  }
  return{partyName:rows[0]||'',number:numberRow?.replace(/^.*?fatura\s*(?:numarası|numarasi|no)\s*[:.]?\s*/i,'').trim()||'',date:dateMatch?`${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`:'',total:totalRow?lastAmount(totalRow):'',vat:vatRow?lastAmount(vatRow):'',lines};
}
