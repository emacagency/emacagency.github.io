import json, numpy as np, wave, sys
w=wave.open('voice_raw.wav'); sr=w.getframerate(); a=np.frombuffer(w.readframes(w.getnframes()),np.int16).astype(np.float32)/32768
words=json.load(open('reel-imposter.words.json'))
hop=int(sr*0.01); n=len(a)//hop
rms=np.sqrt(np.mean(a[:n*hop].reshape(n,hop)**2,axis=1)); db=20*np.log10(rms+1e-9)
sil=db< -42
# silence runs
runs=[];i=0
while i<n:
    if sil[i]:
        j=i
        while j<n and sil[j]: j+=1
        runs.append((i*0.01,j*0.01)); i=j
    else: i+=1
# long pause after these word indices (end of line / emphasis)
long_after={6:.55,16:.65,21:.45,22:.5,26:.4,30:.45,41:.45,46:.3,48:.55,49:.3,55:.5,61:.5,69:.45,79:1.0,82:.4}
def pause_for(t0):
    # find last word ending before t0
    k=max([i for i,x in enumerate(words) if x['t']<=t0] or [0])
    return long_after.get(k,0.26)
segs=[];cur=0.0;mapping=[]  # (orig_start, orig_end, new_start)
out=[];newt=0.0
for s,e in runs:
    if e-s<0.3 or s<0.05: continue
    keep=pause_for(s)
    if e-s<=keep: continue
    # keep audio cur..s+keep/2 , skip to e-keep/2
    a1=s+keep/2; a2=e-keep/2
    mapping.append((cur,a1,newt)); out.append(a[int(cur*sr):int(a1*sr)]); newt+=a1-cur; cur=a2
end=len(a)/sr
# trim tail
mapping.append((cur,end,newt)); out.append(a[int(cur*sr):]); newt+=end-cur
def m(t):
    for o0,o1,n0 in mapping:
        if t<=o1: return n0+max(0,t-o0)
    return newt
y=np.concatenate(out)
lead=0.35  # small lead-in for the hook text frame
y=np.concatenate([np.zeros(int(sr*lead),np.float32),y])
for x in words: x['t']=round(m(x['t'])+lead,3)
json.dump(words,open('words_tight.json','w'),ensure_ascii=False)
o=wave.open('voice_tight.wav','w');o.setnchannels(1);o.setsampwidth(2);o.setframerate(sr);o.writeframes((np.clip(y,-1,1)*32767).astype(np.int16).tobytes());o.close()
print('dur',len(y)/sr)
print(' '.join(f"{x['w']}@{x['t']:.2f}" for x in words))
