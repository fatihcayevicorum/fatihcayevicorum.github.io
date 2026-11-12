#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <WiFiManager.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Update.h>
#include <mbedtls/sha256.h>
#include <time.h>
#include <esp_system.h>
#include "cloud_ca.h"
#if __has_include("boiler_cloud.h")
#include "boiler_cloud.h"
#else
#define BOILER_CLOUD_URL ""
#define BOILER_DEVICE_TOKEN ""
#endif

#if __has_include("device_secrets.h")
#include "device_secrets.h"
#else
#error "device_secrets.h bulunamadi. device_secrets.example.h dosyasini kopyalayip device_secrets.h olarak adlandirin ve sifreleri degistirin."
#endif

// Fatih Cay Evi - Akilli Kazan cihaz yazilimi
// Firmware surumu ana uygulamanin R surumlerinden bagimsizdir.
static const char *FIRMWARE_VERSION = "KazanFW 0.6.3-kalibrasyon-aday";
// Sunucudan gelen offset yalnizca goruntu icindir; Modbus/ENDA kontrolune uygulanmaz.
float displayCalibrationC=0.0f;\nstatic const char *SETUP_AP_NAME = "FatihKazan-Kurulum";

static const uint8_t RX_PIN = 16;
static const uint8_t TX_PIN = 17;
static const uint8_t SETUP_BUTTON_PIN = 0;  // ESP32 DevKit V1 BOOT dugmesi

static const uint32_t MODBUS_INTERVAL_MS = 3000;
static const uint32_t TEMPERATURE_STALE_MS = 10000;
static const uint32_t WIFI_RETRY_INTERVAL_MS = 10000;
static const uint32_t SETUP_BUTTON_HOLD_MS = 5000;
static const uint16_t CONFIG_PORTAL_TIMEOUT_SECONDS = 180;

// Bu kurulumda ENDA ham degeri dogrudan derece C ile uyumlu goruldu.
// ENDA ondalik/olcek ayari degisirse fiziksel cihazda dogrulanarak guncellenmeli.
static const float TEMPERATURE_SCALE = 1.0f;

HardwareSerial enda(2);
WiFiManager wifiManager;
WebServer server(80);

float lastTargetC=0;
uint32_t lastTargetReadMs=0;
bool targetReadOK=false;

int16_t lastRawTemperature = 0;
float lastTemperatureC = 0.0f;
uint32_t lastSuccessfulReadMs = 0;
uint32_t lastReadAttemptMs = 0;
uint32_t lastWifiRetryMs = 0;
uint32_t buttonPressedAtMs = 0;
bool hasSuccessfulReading = false;
bool lastModbusAttemptSucceeded = false;
bool configurationPortalRequested = false;
bool configurationPortalActive = false;
bool heaterOutputKnown = false;
bool heaterOn = false;

struct TargetControl {bool ready;float minimum,maximum;int reg,decimal;};
bool inspectControl(TargetControl &c,float &active);
TargetControl targetControl={false,20,100,0,0};
struct TargetCommand {char id[33];int target10,expected10,reg,decimal;unsigned long deadline;uint32_t receivedAt;};
QueueHandle_t commandQueue=nullptr;
char bootId[33]={0},resultId[33]={0},lastCommandId[33]={0};
uint8_t resultStatus=0; // 1 confirmed, 2 rejected, 3 unknown
struct HysteresisControl {bool ready;bool onOff;int value;};
HysteresisControl hysteresisControl={false,false,0};
struct HysteresisCommand {char id[33];int value,expected;unsigned long deadline;uint32_t receivedAt;};
QueueHandle_t hysteresisQueue=nullptr;
char hysteresisResultId[33]={0},lastHysteresisCommandId[33]={0};
uint8_t hysteresisResultStatus=0; // 1 confirmed, 2 rejected, 3 unknown

// HTTPS ayrı görevde çalışır; Modbus okumasını ve yerel paneli bekletmez.
struct OtaReport {char requestId[33];uint8_t status;char error[121];};
struct CloudSample {float temperature;uint32_t measuredAt;bool valid;float target;uint32_t targetAt;bool targetValid;TargetControl control;HysteresisControl hysteresis;bool heaterKnown;bool heaterActive;char resultId[33];uint8_t resultStatus;char hysteresisResultId[33];uint8_t hysteresisResultStatus;OtaReport ota;};
QueueHandle_t cloudQueue = nullptr;
OtaReport otaReport={{0},0,{0}};
char lastOtaRequestId[33]={0};

void setOtaReport(const char *requestId,uint8_t status,const char *message="") {
  if (!requestId || strlen(requestId)!=32) return;
  strncpy(otaReport.requestId,requestId,32);otaReport.requestId[32]=0;
  otaReport.status=status;
  strncpy(otaReport.error,message?message:"",120);otaReport.error[120]=0;
}

String bytesToHex(const uint8_t *bytes,size_t length) {
  static const char digits[]="0123456789abcdef";String result;result.reserve(length*2);
  for(size_t i=0;i<length;i++){result+=digits[bytes[i]>>4];result+=digits[bytes[i]&15];}
  return result;
}

bool installOta(const String &wire) {
  int p1=wire.indexOf('|'),p2=wire.indexOf('|',p1+1),p3=wire.indexOf('|',p2+1),p4=wire.indexOf('|',p3+1);
  if(p1!=32||p2<=p1+1||p3!=p2+65||p4<=p3+1)return false;
  String requestId=wire.substring(0,p1),version=wire.substring(p1+1,p2),expectedSha=wire.substring(p2+1,p3);
  size_t expectedSize=(size_t)wire.substring(p3+1,p4).toInt();String url=wire.substring(p4+1);
  if(requestId==lastOtaRequestId||expectedSize<65536||expectedSize>4*1024*1024||!url.startsWith("https://"))return false;
  strncpy(lastOtaRequestId,requestId.c_str(),32);lastOtaRequestId[32]=0;setOtaReport(requestId.c_str(),2);
  WiFiClientSecure tls;tls.setCACert(BOILER_CA_CERTS);tls.setHandshakeTimeout(10);HTTPClient http;
  http.setConnectTimeout(10000);http.setTimeout(30000);
  if(!http.begin(tls,url)){setOtaReport(requestId.c_str(),4,"Indirme baglantisi acilamadi.");return false;}
  http.addHeader("Authorization",String("Bearer ")+BOILER_DEVICE_TOKEN);
  int code=http.GET();int length=http.getSize();
  if(code!=200||length!=(int)expectedSize){http.end();setOtaReport(requestId.c_str(),4,"Firmware boyutu veya HTTP yaniti gecersiz.");return false;}
  if(!Update.begin(expectedSize)){http.end();setOtaReport(requestId.c_str(),4,"OTA bolumu yetersiz.");return false;}
  setOtaReport(requestId.c_str(),3);WiFiClient *stream=http.getStreamPtr();uint8_t buffer[1024],digest[32];size_t written=0;
  mbedtls_sha256_context sha;mbedtls_sha256_init(&sha);mbedtls_sha256_starts(&sha,0);
  uint32_t lastData=millis();
  while(written<expectedSize&&millis()-lastData<30000){size_t available=stream->available();if(!available){delay(5);continue;}size_t want=min(available,sizeof(buffer));int got=stream->readBytes(buffer,want);if(got<=0)continue;lastData=millis();mbedtls_sha256_update(&sha,buffer,got);if(Update.write(buffer,got)!=(size_t)got)break;written+=got;}
  mbedtls_sha256_finish(&sha,digest);mbedtls_sha256_free(&sha);http.end();
  if(written!=expectedSize||bytesToHex(digest,32)!=expectedSha){Update.abort();setOtaReport(requestId.c_str(),4,"Firmware SHA-256 dogrulamasi basarisiz.");return false;}
  if(!Update.end(true)){setOtaReport(requestId.c_str(),4,"Firmware kurulumu tamamlanamadi.");return false;}
  Serial.printf("OTA %s kuruluyor; cihaz yeniden baslatiliyor.\n",version.c_str());delay(500);ESP.restart();return true;
}
void publishCloudSnapshot() {
  if (!cloudQueue) return;
  CloudSample s = {lastTemperatureC,lastSuccessfulReadMs,
    lastModbusAttemptSucceeded && hasSuccessfulReading && (millis()-lastSuccessfulReadMs<=TEMPERATURE_STALE_MS),lastTargetC,lastTargetReadMs,targetReadOK,targetControl,hysteresisControl,heaterOutputKnown,heaterOn,{0},resultStatus,{0},hysteresisResultStatus,otaReport};
  strncpy(s.resultId,resultId,32);
  strncpy(s.hysteresisResultId,hysteresisResultId,32);
  xQueueOverwrite(cloudQueue,&s);
}
void cloudTask(void *) {
  uint32_t interval=5000;
  for (;;) {
    vTaskDelay(pdMS_TO_TICKS(interval));
    if (WiFi.status()!=WL_CONNECTED || time(nullptr)<1700000000) continue;
    CloudSample s;
    if (!cloudQueue || xQueuePeek(cloudQueue,&s,0)!=pdTRUE) continue;
    uint32_t age=millis()-s.measuredAt;
    bool valid=s.valid && age<=TEMPERATURE_STALE_MS;
    uint32_t targetAge=millis()-s.targetAt;
    bool targetValid=valid && s.targetValid && targetAge<=TEMPERATURE_STALE_MS;
    uint64_t sentAt=(uint64_t)time(nullptr)*1000ULL;
    char stamp[24];snprintf(stamp,sizeof(stamp),"%llu",(unsigned long long)sentAt);
    String json="{\"deviceId\":\"kazan-1\",\"sentAtMs\":"+String(stamp);
    json+=",\"temperatureC\":"+(valid?String(s.temperature,1):String("null"));
    json+=",\"targetTemperatureC\":"+(targetValid?String(s.target,1):String("null"));
    json+=",\"targetAgeMs\":"+(targetValid?String(targetAge):String("null"));
    json+=",\"measuredAgeMs\":"+(valid?String(age):String("null"));
    json+=",\"endaConnected\":"+String(valid?"true":"false");
    json+=",\"heaterOutputKnown\":"+String(valid&&s.heaterKnown?"true":"false");
    json+=",\"heaterOn\":"+(valid&&s.heaterKnown?String(s.heaterActive?"true":"false"):String("null"));
    json+=",\"bootId\":\""+String(bootId)+"\"";
    if(targetValid && s.control.ready){
      json+=",\"control\":{\"min\":"+String(s.control.minimum,1)+",\"max\":"+String(s.control.maximum,1)+",\"register\":"+String(s.control.reg)+",\"decimal\":"+String(s.control.decimal)+"}";
    }
    if(valid && s.hysteresis.ready){json+=",\"hysteresis\":{\"onOff\":"+String(s.hysteresis.onOff?"true":"false")+",\"value\":"+String(s.hysteresis.value)+"}";}
    if(s.resultStatus && strlen(s.resultId)==32){json+=",\"result\":{\"id\":\""+String(s.resultId)+"\",\"status\":\""+String(s.resultStatus==1?"confirmed":s.resultStatus==2?"rejected":"unknown")+"\"}";}
    if(s.hysteresisResultStatus && strlen(s.hysteresisResultId)==32){json+=",\"hysteresisResult\":{\"id\":\""+String(s.hysteresisResultId)+"\",\"status\":\""+String(s.hysteresisResultStatus==1?"confirmed":s.hysteresisResultStatus==2?"rejected":"unknown")+"\"}";}
    if(s.ota.status && strlen(s.ota.requestId)==32){const char *status=s.ota.status==1?"offered":s.ota.status==2?"downloading":s.ota.status==3?"installing":"failed";json+=",\"ota\":{\"requestId\":\""+String(s.ota.requestId)+"\",\"status\":\""+String(status)+"\",\"error\":\""+jsonEscape(String(s.ota.error))+"\"}";}
    json+=",\"firmwareVersion\":\""+String(FIRMWARE_VERSION)+"\"}";
    WiFiClientSecure tls;
    tls.setCACert(BOILER_CA_CERTS);
    tls.setHandshakeTimeout(8);
    HTTPClient http;
    http.setConnectTimeout(8000);http.setTimeout(8000);
    // URL ve anahtar seri porta, yerel durum API'sine veya tarayıcıya yazılmaz.
    int code=-1;
    if(http.begin(tls,BOILER_CLOUD_URL)) {
      String otaWire;
      http.addHeader("Content-Type","application/json");
      http.addHeader("Authorization",String("Bearer ")+BOILER_DEVICE_TOKEN);
      const char *headers[]={"X-Boiler-Command","X-Boiler-Hysteresis","X-Boiler-Ota","X-Boiler-Calibration"};http.collectHeaders(headers,4);
      code=http.POST(json);
      if(code==200 && commandQueue){
        String wire=http.header("X-Boiler-Command");TargetCommand cmd={};int used=0;
        if(sscanf(wire.c_str(),"%32[0-9a-f],%d,%d,%d,%d,%lu%n",cmd.id,&cmd.target10,&cmd.expected10,&cmd.reg,&cmd.decimal,&cmd.deadline,&used)==6 && used==(int)wire.length() && strlen(cmd.id)==32){cmd.receivedAt=millis();xQueueSend(commandQueue,&cmd,0);}
      }
      if(code==200 && hysteresisQueue){
        String wire=http.header("X-Boiler-Hysteresis");HysteresisCommand cmd={};int used=0;
        if(sscanf(wire.c_str(),"%32[0-9a-f],%d,%d,%lu%n",cmd.id,&cmd.value,&cmd.expected,&cmd.deadline,&used)==4 && used==(int)wire.length() && strlen(cmd.id)==32){cmd.receivedAt=millis();xQueueSend(hysteresisQueue,&cmd,0);}
      }
      if(code==200){otaWire=http.header("X-Boiler-Ota");String calibrationWire=http.header("X-Boiler-Calibration");char *end=nullptr;float candidate=strtof(calibrationWire.c_str(),&end);if(calibrationWire.length()&&end&&*end=='\\0'&&isfinite(candidate)&&fabsf(candidate)<=5.0f&&fabsf(candidate*10.0f-roundf(candidate*10.0f))<0.001f)displayCalibrationC=candidate;}
      http.end();
      if(otaWire.length())installOta(otaWire);
    }
    if(code==200){interval=5000;Serial.println("Bulut sicaklik aktarimi tamamlandi.");}
    else{interval=interval<120000?interval*2:120000;if(interval>120000)interval=120000;
      Serial.printf("Bulut aktarimi tamamlanamadi (HTTP %d). Yeniden denenecek.\n",code);}
  }
}

static const char PANEL_HTML[] PROGMEM = R"HTML(
<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#071426">
  <title>Fatih Çay Evi | Akıllı Kazan</title>
  <style>
    :root{color-scheme:dark;--bg:#071426;--panel:#0d2038;--panel2:#112a47;--line:#203b59;--text:#f7f2e8;--muted:#9db0c5;--red:#b62c34;--green:#2fb879;--orange:#e89b35;--blue:#3b82c4}
    *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    body{margin:0;min-height:100vh;background:radial-gradient(circle at top,#102b4b 0,#071426 52%);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
    .wrap{width:min(980px,100%);margin:auto;padding:18px clamp(14px,3vw,28px) 30px}
    header{display:flex;align-items:center;gap:13px;margin-bottom:18px}
    .mark{width:50px;height:50px;border-radius:16px;background:var(--red);display:grid;place-items:center;font-weight:900;font-size:22px;box-shadow:0 10px 28px #0006}
    h1{font-size:clamp(20px,3.5vw,28px);margin:0}.sub{color:var(--muted);font-size:13px;margin-top:3px}
    .hero{background:linear-gradient(145deg,#132e4e,#0b1d33);border:1px solid var(--line);border-radius:24px;padding:24px;text-align:center;box-shadow:0 18px 45px #0004}
    .label{color:var(--muted);font-size:13px;text-transform:uppercase;letter-spacing:.09em}.temp{font-size:clamp(68px,18vw,132px);line-height:1;font-weight:800;margin:10px 0}.temp small{font-size:.28em;color:#c9d6e3;vertical-align:top;margin-left:5px}
    .status{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:8px 13px;background:#ffffff0b;border:1px solid var(--line);font-weight:700}.dot{width:10px;height:10px;border-radius:50%;background:var(--orange)}.ok .dot{background:var(--green);box-shadow:0 0 13px #2fb879}.bad .dot{background:var(--red);box-shadow:0 0 13px #b62c34}
    .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:14px}.card{min-height:112px;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:16px}.card .k{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.06em}.card .v{font-size:18px;font-weight:750;margin-top:8px;overflow-wrap:anywhere}.card .d{font-size:12px;color:var(--muted);margin-top:5px}
    .actions{margin-top:14px;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:16px}.actions h2{font-size:17px;margin:0 0 7px}.actions p{font-size:13px;color:var(--muted);margin:0 0 13px;line-height:1.45}
    button{width:100%;min-height:50px;border:0;border-radius:14px;background:var(--red);color:white;font-weight:800;font-size:15px;cursor:pointer}button:active{transform:scale(.985)}button:disabled{opacity:.55;cursor:wait}
    dialog{width:min(430px,calc(100% - 28px));border:1px solid var(--line);border-radius:20px;background:#0b1d33;color:var(--text);padding:20px;box-shadow:0 24px 70px #000b}dialog::backdrop{background:#020915cc;backdrop-filter:blur(4px)}dialog h3{margin:0 0 8px}dialog p{color:var(--muted);font-size:13px;line-height:1.45}label{display:block;color:var(--muted);font-size:12px;margin:12px 0 6px}input{width:100%;min-height:48px;border:1px solid var(--line);border-radius:12px;background:#071426;color:white;padding:0 13px;font-size:16px}.row{display:flex;gap:10px;margin-top:16px}.row button{flex:1}.secondary{background:#203b59}
    .toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);width:min(460px,calc(100% - 28px));background:#152f4d;border:1px solid var(--line);padding:13px 16px;border-radius:14px;box-shadow:0 12px 35px #0008;display:none;text-align:center;font-weight:650}
    @media(min-width:740px){.grid{grid-template-columns:repeat(3,minmax(0,1fr))}.actions{display:grid;grid-template-columns:1fr 250px;align-items:center;gap:18px}.actions p{margin:0}}
  </style>
</head>
<body>
  <main class="wrap">
    <header><div class="mark">F</div><div><h1>Fatih Çay Evi</h1><div class="sub">Akıllı Kazan · Yerel izleme paneli</div></div></header>
    <section class="hero">
      <div class="label">Anlık sıcaklık</div>
      <div class="temp" id="temperature">--<small>°C</small></div>
      <div class="status" id="mainStatus"><span class="dot"></span><span id="mainStatusText">Veri bekleniyor</span></div>
    </section>
    <section class="grid">
      <article class="card"><div class="k">Hedef sıcaklık</div><div class="v" id="target">—</div><div class="d">ENDA’dan okunan aktif hedef</div></article>
      <article class="card"><div class="k">ENDA haberleşme</div><div class="v" id="enda">Kontrol ediliyor</div><div class="d" id="lastData">Son veri bekleniyor</div></article>
      <article class="card"><div class="k">Wi-Fi</div><div class="v" id="wifi">Kontrol ediliyor</div><div class="d" id="signal">Sinyal bekleniyor</div></article>
      <article class="card"><div class="k">Cihaz IP adresi</div><div class="v" id="ip">—</div><div class="d">Aynı yerel ağdan erişim</div></article>
      <article class="card"><div class="k">Yazılım sürümü</div><div class="v" id="firmware">—</div><div class="d">ESP32 cihaz yazılımı</div></article>
      <article class="card"><div class="k">Çalışma süresi</div><div class="v" id="uptime">—</div><div class="d">Son yeniden başlatmadan beri</div></article>
      <article class="card"><div class="k">Panel güncelleme</div><div class="v">3 saniye</div><div class="d">Salt okunur yerel görünüm</div></article>
    </section>
    <section class="actions"><div><h2>Wi-Fi ağını değiştir</h2><p>Yalnızca yetkili kullanıcı başlatabilir. İşlem sırasında cihaz 3 dakika boyunca FatihKazan-Kurulum ağını açar; sıcaklık okuması kısa süreli kesilebilir.</p></div><button id="wifiButton">Yeniden kurulum başlat</button></section>
  </main>
  <dialog id="authDialog"><h3>Yetkili işlemi</h3><p>Panel kullanıcı adı ve parolanızı girin. Bilgiler tarayıcıda saklanmaz.</p><label for="username">Kullanıcı adı</label><input id="username" autocomplete="username"><label for="password">Parola</label><input id="password" type="password" autocomplete="current-password"><div class="row"><button class="secondary" id="cancelButton">Vazgeç</button><button id="confirmButton">Başlat</button></div></dialog>
  <div class="toast" id="toast"></div>
  <script>
    const $=id=>document.getElementById(id), dialog=$('authDialog'), toast=$('toast');
    function showToast(message){toast.textContent=message;toast.style.display='block';setTimeout(()=>toast.style.display='none',5000)}
    function ageText(seconds){if(seconds===null)return'Son veri yok';if(seconds<2)return'Son veri şimdi';if(seconds<60)return`Son veri ${seconds} sn önce`;return`Son veri ${Math.floor(seconds/60)} dk önce`}
    function uptimeText(seconds){const d=Math.floor(seconds/86400),h=Math.floor(seconds%86400/3600),m=Math.floor(seconds%3600/60);return d?`${d} gün ${h} sa`:(h?`${h} sa ${m} dk`:`${m} dk`)}
    async function refresh(){try{const response=await fetch('/api/status',{cache:'no-store'});if(!response.ok)throw new Error();const s=await response.json();$('temperature').innerHTML=s.temperature_valid?`${Number(s.temperature_c).toFixed(1)}<small>°C</small>`:'--<small>°C</small>';$('target').textContent=Number.isFinite(s.target_temperature_c)?`${s.target_temperature_c} °C`:'—';$('enda').textContent=s.modbus_ok?'Bağlı':'Bağlantı yok';$('lastData').textContent=ageText(s.last_data_age_seconds);$('wifi').textContent=s.wifi_connected?'Bağlı':'Bağlı değil';$('signal').textContent=s.wifi_connected?`Sinyal: ${s.rssi_dbm} dBm`:'Yeniden bağlanma deneniyor';$('ip').textContent=s.ip_address||'—';$('firmware').textContent=s.firmware;$('uptime').textContent=uptimeText(s.uptime_seconds);const box=$('mainStatus');box.className='status '+(s.temperature_valid?'ok':'bad');$('mainStatusText').textContent=s.temperature_valid?'Canlı veri':(s.has_previous_reading?ageText(s.last_data_age_seconds):'ENDA bağlantısı yok')}catch(e){$('target').textContent='—';$('temperature').innerHTML='--<small>°C</small>';$('mainStatus').className='status bad';$('mainStatusText').textContent='Cihaza erişilemiyor'}}
    $('wifiButton').onclick=()=>{dialog.showModal();$('username').focus()};$('cancelButton').onclick=()=>dialog.close();
    $('confirmButton').onclick=async()=>{const button=$('confirmButton'),u=$('username').value,p=$('password').value;if(!u||!p){showToast('Kullanıcı adı ve parola gerekli.');return}button.disabled=true;try{const response=await fetch('/api/wifi/reconfigure',{method:'POST',headers:{Authorization:'Basic '+btoa(unescape(encodeURIComponent(u+':'+p)))}});const result=await response.json();if(!response.ok)throw new Error(result.message||'İşlem başlatılamadı.');dialog.close();$('password').value='';showToast('Kurulum ağı açılıyor. FatihKazan-Kurulum ağına bağlanın.')}catch(e){showToast(e.message||'Yetki doğrulanamadı.')}finally{button.disabled=false}};
    refresh();setInterval(refresh,3000);
  </script>
</body>
</html>
)HTML";

uint16_t modbusCRC(const uint8_t *data, int len) {
  uint16_t crc = 0xFFFF;
  for (int i = 0; i < len; i++) {
    crc ^= data[i];
    for (int j = 0; j < 8; j++) {
      crc = (crc & 1) ? ((crc >> 1) ^ 0xA001) : (crc >> 1);
    }
  }
  return crc;
}

bool readInputWord(uint16_t address,int16_t &value) {
  while (enda.available()) enda.read();

  uint8_t request[8] = {1, 4, (uint8_t)(address >> 8), (uint8_t)address, 0, 1, 0, 0};
  uint16_t crc = modbusCRC(request, 6);
  request[6] = crc & 0xFF;
  request[7] = crc >> 8;

  enda.write(request, 8);
  enda.flush();

  uint8_t response[7];
  int count = 0;
  uint32_t startedAt = millis();
  while (millis() - startedAt < 700 && count < 7) {
    if (enda.available()) response[count++] = enda.read();
    delay(1);
  }

  if (count != 7) return false;
  if (response[0] != 1 || response[1] != 4 || response[2] != 2) return false;

  uint16_t expectedCRC = modbusCRC(response, 5);
  if (response[5] != (expectedCRC & 0xFF) || response[6] != (expectedCRC >> 8)) return false;

  value = (int16_t)((response[3] << 8) | response[4]);
  return true;
}

// ENDA ETx420 official map: FC04 I4 active setpoint, I6 decimal point.
// Read only; never writes a setpoint or switches a heater output.
bool readTarget(float &target) {
  int16_t raw,decimal;
  delay(5);
  if(!readInputWord(4,raw))return false;
  delay(5);
  if(!readInputWord(6,decimal)||(decimal!=0&&decimal!=1))return false;
  target=raw/(decimal==1?10.0f:1.0f);
  return isfinite(target)&&target>=-50&&target<=200;
}

// FC03 holding, FC01 coil and FC02 discrete input reads share validation.
bool readControlWord(uint8_t function,uint16_t address,int16_t &value){
  delay(5);while(enda.available())enda.read();
  uint8_t req[8]={1,function,(uint8_t)(address>>8),(uint8_t)address,0,1,0,0};
  uint16_t crc=modbusCRC(req,6);req[6]=crc&255;req[7]=crc>>8;
  enda.write(req,8);enda.flush();
  bool bitFunction=function==1||function==2;const int size=bitFunction?6:7;uint8_t r[7]={};int n=0;uint32_t began=millis();
  while(millis()-began<700&&n<size){if(enda.available())r[n++]=enda.read();delay(1);}
  if(n!=size||r[0]!=1||r[1]!=function||r[2]!=(bitFunction?1:2))return false;
  crc=modbusCRC(r,size-2);if(r[size-2]!=(crc&255)||r[size-1]!=(crc>>8))return false;
  value=bitFunction?(r[3]&1):(int16_t)((r[3]<<8)|r[4]);return true;
}
bool readHeaterOutput(bool &active){
  int16_t selected,output;if(!readControlWord(3,32,selected)||(selected!=0&&selected!=1))return false;
  uint16_t discreteAddress=selected==0?0:2;if(!readControlWord(2,discreteAddress,output))return false;
  active=output==1;return true;
}
bool inspectControl(TargetControl &c,float &active){
  c.ready=false;int16_t fahrenheit,selected,decimal,low,high,stored,error,manual;
  if(!readControlWord(1,5,fahrenheit)||fahrenheit!=0||!readControlWord(1,7,selected)||!readControlWord(1,8,manual)||manual!=0)return false;
  delay(5);if(!readInputWord(2,error)||error!=0)return false;
  delay(5);if(!readInputWord(6,decimal)||(decimal!=0&&decimal!=1))return false;
  if(!readControlWord(3,2,low)||!readControlWord(3,3,high)||!readControlWord(3,selected,stored))return false;
  if(!readTarget(active))return false;
  float scale=decimal==1?10.0f:1.0f;
  if(fabs(active-stored/scale)>0.05f)return false;
  c.minimum=fmaxf(20,low/scale);c.maximum=fminf(100,high/scale);c.reg=selected;c.decimal=decimal;
  c.ready=c.minimum<=c.maximum;return c.ready;
}
// Official ETx420 map: H4 proportional band, H5 C.HYS. C.HYS is active only if H4 is zero.
bool inspectHysteresis(HysteresisControl &h){
  h={false,false,0};int16_t proportionalBand,value;
  if(!readControlWord(3,4,proportionalBand)||proportionalBand<0||proportionalBand>1000)return false;
  if(!readControlWord(3,5,value)||value<1||value>50)return false;
  h.ready=true;h.onOff=proportionalBand==0;h.value=value;return true;
}
bool writeHoldingWordOnce(uint16_t address,int16_t raw){
  if(address!=0&&address!=1&&address!=5)return false;
  delay(5);while(enda.available())enda.read();
  uint8_t req[8]={1,6,0,(uint8_t)address,(uint8_t)((uint16_t)raw>>8),(uint8_t)raw,0,0};
  uint16_t crc=modbusCRC(req,6);req[6]=crc&255;req[7]=crc>>8;
  enda.write(req,8);enda.flush();uint8_t r[8]={};int n=0;uint32_t began=millis();
  while(millis()-began<700&&n<8){if(enda.available())r[n++]=enda.read();delay(1);}
  return n==8 && memcmp(req,r,8)==0;
}
void handleTargetCommand(){
  TargetCommand cmd;if(!commandQueue||xQueueReceive(commandQueue,&cmd,0)!=pdTRUE)return;
  if(strcmp(lastCommandId,cmd.id)==0)return;
  strncpy(lastCommandId,cmd.id,32);strncpy(resultId,cmd.id,32);resultStatus=2;
  if(configurationPortalActive||configurationPortalRequested||WiFi.status()!=WL_CONNECTED||millis()-cmd.receivedAt>2000||time(nullptr)<1700000000||time(nullptr)>=(time_t)cmd.deadline)return;
  if(cmd.target10<200||cmd.target10>1000||cmd.target10%10||cmd.reg<0||cmd.reg>1||cmd.decimal<0||cmd.decimal>1)return;
  TargetControl current;float active;
  if(!inspectControl(current,active)||current.reg!=cmd.reg||current.decimal!=cmd.decimal||fabs(active*10-cmd.expected10)>0.1f||cmd.target10<current.minimum*10||cmd.target10>current.maximum*10)return;
  if(time(nullptr)>=(time_t)cmd.deadline||millis()-cmd.receivedAt>5000||WiFi.status()!=WL_CONNECTED)return;
  // A command is attempted once. A lost write response never triggers a retry.
  resultStatus=3;
  bool echoed=writeHoldingWordOnce(cmd.reg,cmd.decimal?cmd.target10:cmd.target10/10);
  TargetControl after;float observed;
  if(inspectControl(after,observed)){
    lastTargetC=observed;lastTargetReadMs=millis();targetReadOK=true;targetControl=after;
    if(echoed&&after.reg==cmd.reg&&after.decimal==cmd.decimal&&fabs(observed*10-cmd.target10)<0.1f)resultStatus=1;
  }else{targetReadOK=false;targetControl.ready=false;}
}
void handleHysteresisCommand(){
  HysteresisCommand cmd;if(!hysteresisQueue||xQueueReceive(hysteresisQueue,&cmd,0)!=pdTRUE)return;
  if(strcmp(lastHysteresisCommandId,cmd.id)==0)return;
  strncpy(lastHysteresisCommandId,cmd.id,32);strncpy(hysteresisResultId,cmd.id,32);hysteresisResultStatus=2;
  if(configurationPortalActive||configurationPortalRequested||WiFi.status()!=WL_CONNECTED||millis()-cmd.receivedAt>2000||time(nullptr)<1700000000||time(nullptr)>=(time_t)cmd.deadline)return;
  if(cmd.value<1||cmd.value>10||cmd.expected<1||cmd.expected>50)return;
  HysteresisControl current;if(!inspectHysteresis(current)||!current.onOff||current.value!=cmd.expected)return;
  if(time(nullptr)>=(time_t)cmd.deadline||millis()-cmd.receivedAt>5000||WiFi.status()!=WL_CONNECTED)return;
  hysteresisResultStatus=3;
  bool echoed=writeHoldingWordOnce(5,cmd.value);HysteresisControl after;
  if(inspectHysteresis(after)){hysteresisControl=after;if(echoed&&after.onOff&&after.value==cmd.value)hysteresisResultStatus=1;}
  else hysteresisControl.ready=false;
}

String jsonEscape(const String &value) {
  String escaped;
  escaped.reserve(value.length() + 8);
  for (size_t i = 0; i < value.length(); i++) {
    char c = value[i];
    if (c == '\\' || c == '"') {
      escaped += '\\';
      escaped += c;
    } else if (c == '\n') {
      escaped += "\\n";
    } else if ((uint8_t)c >= 0x20) {
      escaped += c;
    }
  }
  return escaped;
}

bool isTemperatureFresh(uint32_t nowMs) {
  return hasSuccessfulReading && (nowMs - lastSuccessfulReadMs <= TEMPERATURE_STALE_MS);
}

bool authenticatePanelAction() {
  if (server.authenticate(PANEL_USERNAME, PANEL_PASSWORD)) return true;
  server.sendHeader("WWW-Authenticate", "Basic realm=\"Fatih Kazan Ayarlari\"");
  server.send(401, "application/json; charset=utf-8", "{\"ok\":false,\"message\":\"Kullanici adi veya parola hatali.\"}");
  return false;
}

void sendStatus() {
  uint32_t nowMs = millis();
  bool wifiConnected = WiFi.status() == WL_CONNECTED;
  bool temperatureValid = isTemperatureFresh(nowMs);
  String ip = wifiConnected ? WiFi.localIP().toString() : "";

  String json;
  json.reserve(480);
  json += "{";
  json += "\"temperature_valid\":" + String(temperatureValid ? "true" : "false") + ",";
  json += "\"has_previous_reading\":" + String(hasSuccessfulReading ? "true" : "false") + ",";
  json += "\"temperature_c\":" + String(lastTemperatureC+displayCalibrationC, 1) + ",";
  json += "\"raw_temperature_c\":" + String(lastTemperatureC, 1) + ",";
  json += "\"calibration_c\":" + String(displayCalibrationC, 1) + ",";
  bool targetValid=temperatureValid && lastModbusAttemptSucceeded && targetReadOK && nowMs-lastTargetReadMs<=TEMPERATURE_STALE_MS;
  json += "\"target_temperature_c\":" + (targetValid?String(lastTargetC,1):String("null")) + ",";
  json += "\"onoff_mode\":" + String(hysteresisControl.ready&&hysteresisControl.onOff ? "true" : "false") + ",";
  json += "\"hysteresis_c\":" + (hysteresisControl.ready?String(hysteresisControl.value):String("null")) + ",";
  json += "\"raw_temperature\":" + String(lastRawTemperature) + ",";
  json += "\"modbus_ok\":" + String(lastModbusAttemptSucceeded ? "true" : "false") + ",";
  if (hasSuccessfulReading) {
    json += "\"last_data_age_seconds\":" + String((nowMs - lastSuccessfulReadMs) / 1000) + ",";
  } else {
    json += "\"last_data_age_seconds\":null,";
  }
  json += "\"wifi_connected\":" + String(wifiConnected ? "true" : "false") + ",";
  json += "\"rssi_dbm\":" + String(wifiConnected ? WiFi.RSSI() : 0) + ",";
  json += "\"ip_address\":\"" + jsonEscape(ip) + "\",";
  json += "\"firmware\":\"" + jsonEscape(FIRMWARE_VERSION) + "\",";
  json += "\"uptime_seconds\":" + String(nowMs / 1000) + ",";
  json += "\"portal_active\":" + String(configurationPortalActive ? "true" : "false");
  json += "}";

  server.sendHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  server.send(200, "application/json; charset=utf-8", json);
}

void configureWebServer() {
  server.on("/", HTTP_GET, []() {
    server.sendHeader("Cache-Control", "no-store");
    server.send_P(200, "text/html; charset=utf-8", PANEL_HTML);
  });
  server.on("/api/status", HTTP_GET, sendStatus);
  server.on("/api/wifi/reconfigure", HTTP_POST, []() {
    if (!authenticatePanelAction()) return;
    configurationPortalRequested = true;
    server.send(202, "application/json; charset=utf-8", "{\"ok\":true,\"message\":\"Kurulum modu baslatiliyor.\"}");
  });
  server.onNotFound([]() {
    server.send(404, "application/json; charset=utf-8", "{\"ok\":false,\"message\":\"Bulunamadi.\"}");
  });
  server.begin();
}

void startConfigurationPortal() {
  configurationPortalRequested = false;
  configurationPortalActive = true;
  server.stop();

  Serial.println("Kullanici istegiyle Wi-Fi kurulum modu baslatildi.");
  wifiManager.setConfigPortalTimeout(CONFIG_PORTAL_TIMEOUT_SECONDS);
  bool connected = wifiManager.startConfigPortal(SETUP_AP_NAME, SETUP_AP_PASSWORD);
  configurationPortalActive = false;

  if (connected) {
    Serial.print("Wi-Fi kurulumu tamamlandi. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("Wi-Fi kurulum suresi doldu veya baglanti kurulamadi.");
  }
  server.begin();
}

void handleSetupButton(uint32_t nowMs) {
  bool pressed = digitalRead(SETUP_BUTTON_PIN) == LOW;
  if (!pressed) {
    buttonPressedAtMs = 0;
    return;
  }
  if (buttonPressedAtMs == 0) buttonPressedAtMs = nowMs;
  if (!configurationPortalActive && nowMs - buttonPressedAtMs >= SETUP_BUTTON_HOLD_MS) {
    buttonPressedAtMs = 0;
    configurationPortalRequested = true;
  }
}

void handleWifiReconnect(uint32_t nowMs) {
  if (configurationPortalActive || WiFi.status() == WL_CONNECTED) return;
  if (nowMs - lastWifiRetryMs < WIFI_RETRY_INTERVAL_MS) return;
  lastWifiRetryMs = nowMs;
  WiFi.reconnect();
}

void setup() {
  Serial.begin(115200);
  snprintf(bootId,sizeof(bootId),"%08x%08x%08x%08x",(unsigned)esp_random(),(unsigned)esp_random(),(unsigned)esp_random(),(unsigned)esp_random());
  commandQueue=xQueueCreate(1,sizeof(TargetCommand));
  hysteresisQueue=xQueueCreate(1,sizeof(HysteresisCommand));
  enda.begin(9600, SERIAL_8N1, RX_PIN, TX_PIN);
  pinMode(SETUP_BUTTON_PIN, INPUT_PULLUP);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(true);
  wifiManager.setConfigPortalTimeout(CONFIG_PORTAL_TIMEOUT_SECONDS);
  wifiManager.setConnectTimeout(20);
  wifiManager.setConnectRetries(3);

  Serial.println();
  Serial.println("Fatih Cay Evi - Akilli Kazan");
  Serial.println(FIRMWARE_VERSION);
  Serial.println("Wi-Fi baglantisi baslatiliyor...");

  bool connected = wifiManager.autoConnect(SETUP_AP_NAME, SETUP_AP_PASSWORD);
  if (connected) {
    Serial.print("Wi-Fi baglandi. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("Wi-Fi baglanamadi. Sicaklik okuma devam edecek.");
  }

  configureWebServer();
  configTime(0,0,"time.google.com","pool.ntp.org");
  String cloudUrl=BOILER_CLOUD_URL;
  if (cloudUrl.startsWith("https://europe-west1-") && cloudUrl.endsWith(".cloudfunctions.net/receiveBoilerTemperature") && strlen(BOILER_DEVICE_TOKEN)==64) {
    cloudQueue=xQueueCreate(1,sizeof(CloudSample));
    if(cloudQueue && xTaskCreate(cloudTask,"boiler-cloud",16384,nullptr,1,nullptr)!=pdPASS) {
      vQueueDelete(cloudQueue);cloudQueue=nullptr;Serial.println("Bulut gorevi baslatilamadi.");
    }
  } else Serial.println("Bulut baglanti dosyasi yok. Yerel panel calismaya devam ediyor.");
}

void loop() {
  uint32_t nowMs = millis();
  server.handleClient();
  handleSetupButton(nowMs);
  handleWifiReconnect(nowMs);

  if (!configurationPortalActive && nowMs - lastReadAttemptMs >= MODBUS_INTERVAL_MS) {
    lastReadAttemptMs = nowMs;
    targetReadOK=false;targetControl.ready=false;hysteresisControl.ready=false;
    int16_t temperature;
    lastModbusAttemptSucceeded = readInputWord(0,temperature);
    if (lastModbusAttemptSucceeded) {
      lastRawTemperature = temperature;
      lastTemperatureC = temperature * TEMPERATURE_SCALE;
      lastSuccessfulReadMs = millis();
      hasSuccessfulReading = true;
      targetReadOK=readTarget(lastTargetC);
      if(targetReadOK){lastTargetReadMs=millis();float checked;if(inspectControl(targetControl,checked)){lastTargetC=checked;lastTargetReadMs=millis();}}
      else Serial.println("ENDA hedef okunamadi; anlik sicaklik korunuyor.");
      inspectHysteresis(hysteresisControl);
      heaterOutputKnown=readHeaterOutput(heaterOn);
      Serial.print("ENDA sicaklik: ");
      Serial.println(lastTemperatureC, 1);
    } else {
      heaterOutputKnown=false;heaterOn=false;
      Serial.println("ENDA haberlesme hatasi");
    }
  }

  handleTargetCommand();
  handleHysteresisCommand();
  publishCloudSnapshot();

  if (configurationPortalRequested && !configurationPortalActive) {
    delay(250);  // HTTP yanitinin tarayiciya ulasmasina kisa sure tanir.
    startConfigurationPortal();
  }
}
