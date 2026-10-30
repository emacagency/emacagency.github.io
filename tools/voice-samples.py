"""Render one paragraph with ten male Arabic neural voices for comparison."""
import asyncio, pathlib, edge_tts

OUT = pathlib.Path(__file__).resolve().parent.parent / "research" / "audio" / "samples"
TEXT = ("فِي كُلِّ وَاحِدَةٍ مِنْ تِرِيلْيُونَاتِ الخَلَايَا فِي جِسْمِكَ، مَصَانِعُ لِلطَّاقَةِ، وَمَكْتَبَةٌ جِينِيَّةٌ، "
        "وَشَبَكَةُ طُرُقٍ، وَخُطُوطُ إِنْتَاجٍ لِلْبُرُوتِينِ. مَعَ إِيمَاك، نَأْخُذُكَ فِي جَوْلَةٍ هُولُوغْرَامِيَّةٍ إِلَى دَاخِلِ الخَلِيَّةِ.")
VOICES = ["ar-EG-ShakirNeural", "ar-SY-LaithNeural", "ar-JO-TaimNeural", "ar-LB-RamiNeural", "ar-IQ-BasselNeural",
          "ar-KW-FahedNeural", "ar-AE-HamdanNeural", "ar-OM-AbdullahNeural", "ar-QA-MoazNeural", "ar-MA-JamalNeural"]


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for i, v in enumerate(VOICES, 1):
        path = OUT / f"{i:02d}-{v.split('-')[2].replace('Neural', '').lower()}.mp3"
        await edge_tts.Communicate(TEXT, v, rate="+6%", pitch="+3Hz").save(str(path))
        print(path.name, path.stat().st_size)

asyncio.run(main())
