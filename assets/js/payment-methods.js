export const PAYMENT_METHODS=Object.freeze(['cash','transfer','card']);
export const DEFAULT_PAYMENT_METHODS=Object.freeze({cash:true,transfer:true,card:true});

export function normalizePaymentMethods(data){
  const raw=data?.methods||{};
  return Object.fromEntries(PAYMENT_METHODS.map(method=>[method,raw[method]!==false]));
}
export function canDisablePaymentMethod(current,method){
  return PAYMENT_METHODS.includes(method)&&PAYMENT_METHODS.some(other=>other!==method&&current[other]!==false);
}
export function applyPaymentRadios(container,methods){
  const radios=[...container.querySelectorAll('input[name="paymentType"]')];
  for(const input of radios){
    input.disabled=methods[input.value]===false;
    input.closest('label')?.classList.toggle('payment-method-disabled',input.disabled);
  }
  const selected=radios.find(input=>input.checked&&!input.disabled);
  if(!selected){const first=radios.find(input=>!input.disabled);if(first)first.checked=true}
}
export function applyPaymentOptions(select,methods){
  for(const option of select.options)option.disabled=methods[option.value]===false;
  if(methods[select.value]===false)select.value=PAYMENT_METHODS.find(method=>methods[method]!==false)||'';
}
