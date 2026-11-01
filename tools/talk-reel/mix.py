import json, numpy as np, wave
sr=48000
T=json.load(open('timing.json'));W=T['words'];L=T['lines']
wt=lambda i:W[i]['t']
dur=L[8]['e']+2.4; N=int(dur*sr)
w=wave.open('voice_tight.wav');v=np.frombuffer(w.readframes(w.getnframes()),np.int16).astype(np.float32)/32768
voice=np.zeros(N,np.float32);voice[:min(N,len(v))]=v[:N]
rng=np.random.default_rng(7)
t=np.arange(N)/sr
def env(a,d,r,n):
    e=np.ones(n);A=int(a*sr);R=int(r*sr)
    if A: e[:A]=np.linspace(0,1,A)
    if R: e[-R:]*=np.linspace(1,0,R)
    return e
def add(buf,sig,at,g=1.0):
    i=int(at*sr);n=min(len(sig),N-i)
    if n>0: buf[i:i+n]+=sig[:n]*g
def lp(x,a):  # one-pole lowpass, a in (0,1)
    y=np.empty_like(x);acc=0.0
    for i in range(len(x)): acc+=a*(x[i]-acc);y[i]=acc
    return y
def sub(at,f0=55,d=1.4,g=.7):
    n=int(d*sr);tt=np.arange(n)/sr;f=f0*(1+1.5*np.exp(-tt*18))
    s=np.sin(2*np.pi*np.cumsum(f)/sr)*np.exp(-tt*3.2);add(fx,s,at,g)
def whoosh(at,d=.55,g=.35):
    n=int(d*sr);x=rng.standard_normal(n).astype(np.float32);tt=np.linspace(0,1,n)
    a=.02+.25*np.sin(np.pi*tt)**2;y=np.empty(n);acc=0
    for i in range(n): acc+=a[i]*(x[i]-acc);y[i]=acc
    add(fx,y*np.sin(np.pi*tt)**1.5*3,at-d*.6,g)
def boom(at,g=.9):
    sub(at,45,2.2,g); n=int(.25*sr);x=rng.standard_normal(n)*np.exp(-np.arange(n)/sr*30);add(fx,lp(x,.05)*2,at,g*.6)
def piano(at,f,g=.22,d=3.0):
    n=int(d*sr);tt=np.arange(n)/sr;s=np.zeros(n)
    for k,amp in [(1,1),(2,.45),(3,.22),(4,.1),(5,.05)]:
        s+=amp*np.sin(2*np.pi*f*k*tt*(1+.0004*k))*np.exp(-tt*(1.6+k*.9))
    s*=np.minimum(1,tt/.004);add(fx,s,at,g)
def click(at,g=.25,f=1800):
    n=int(.06*sr);tt=np.arange(n)/sr;add(fx,np.sin(2*np.pi*f*tt)*np.exp(-tt*90),at,g)
def chime(at,g=.18):
    for f,dl in [(1318.5,0),(1760,.05),(2637,.1)]: piano(at+dl,f,g,2.5)
def riser(a,b,g=.25):
    n=int((b-a)*sr);x=rng.standard_normal(n);tt=np.linspace(0,1,n);y=np.empty(n);acc=0
    for i in range(n): c=.01+.3*tt[i]**2;acc+=c*(x[i]-acc);y[i]=acc
    add(fx,y*tt**2*2.2,a,g)
def crack(at,g=.4):
    n=int(.5*sr);x=rng.standard_normal(n);hp=x-lp(x,.2);add(fx,hp*np.exp(-np.arange(n)/sr*9),at,g)
    for k in range(6): click(at+rng.uniform(0,.25),.12,rng.uniform(2500,5000))
fx=np.zeros(N)
# hook
sub(L[0]['s'],52,1.6,.55); piano(L[0]['s'],220,.2,4)
whoosh(wt(7),.4,.25)                 # the dip
whoosh(L[1]['s'],.5,.3); piano(wt(9),329.6,.2); piano(wt(9)+.18,440,.16)  # success rises
click(wt(15)+.35,.4,900); click(wt(15)+.42,.25,1300)                       # the die lands
whoosh(L[2]['s'],.55,.3); boom(wt(21),.85)
whoosh(L[3]['s'],.5,.3); click(wt(30),.2,700); click(wt(31),.25,500); sub(wt(33),70,.8,.35)
whoosh(L[4]['s'],.5,.28); riser(wt(42),wt(48)+.2,.22)
piano(L[5]['s'],110,.14,5)
whoosh(L[6]['s'],.6,.3); piano(L[6]['s'],261.6,.2); piano(L[6]['s']+.2,329.6,.17); piano(L[6]['s']+.4,392,.15)
chime(wt(69),.12); crack(wt(77),.35)
click(L[8]['s']+.05,.3,1100); whoosh(L[8]['s'],.45,.22)
for k in range(8): click(wt(92)+k*.09,.09,2600+k*220)
boom(L[8]['e']+.45,.6); piano(L[8]['e']+.45,220,.2,3); piano(L[8]['e']+.45,329.6,.14,3)
# music bed: soft pad, mood by section
def pad(freqs,a,b,g):
    n=int((b-a)*sr);tt=np.arange(n)/sr;s=np.zeros(n)
    for f in freqs:
        for det in (-.15,.15): s+=np.sin(2*np.pi*(f+det)*tt+rng.uniform(0,6))
    s=s/len(freqs)/2*(.8+.2*np.sin(2*np.pi*.15*tt))
    add(fx,s*env(.8,0,.8,n),a,g)
pad([110,164.8,220,261.6],0,L[5]['s']+.3,.07)          # A minor, calm
pad([55,82.4,110,116.5],L[5]['s'],L[6]['s']+.3,.08)     # dark drone
pad([130.8,196,261.6,329.6],L[6]['s'],L[7]['s']+.05,.075) # C major lift
# (music drops to silence for the question)
pad([110,164.8,220,261.6,329.6],L[8]['s']-.1,dur,.07)
mix=voice*0.95+fx*0.55
# duck fx/music softly under voice? keep simple: limiter
peak=np.max(np.abs(mix));mix=mix/max(peak,1)*0.93
mix=np.tanh(mix*1.05)/np.tanh(1.05)
st=np.stack([mix,mix],1)
o=wave.open('mix.wav','w');o.setnchannels(2);o.setsampwidth(2);o.setframerate(sr);o.writeframes((st*32767).astype(np.int16).tobytes());o.close()
print('ok',dur)
