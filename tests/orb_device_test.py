#!/usr/bin/env python3
"""Teste de dispositivo do orb neural: invocação, arraste para canto e desligar.

Dados fictícios, sem API externa. Uso:
  python3 tests/orb_device_test.py --serial SERIAL --out ../evidencia/orb-2026-11-25
"""

import argparse
import json
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

PACKAGE = "com.ifpa.iassistente.beta"
ORB = PACKAGE + ":id/assistant_orb"
PANEL = PACKAGE + ":id/assistant_panel"


class Phone:
    def __init__(self, serial, out):
        self.serial, self.out = serial, Path(out)
        self.out.mkdir(parents=True, exist_ok=True)

    def adb(self, *args, binary=False):
        p = subprocess.run(
            ["adb", "-s", self.serial, *args], capture_output=True, timeout=30
        )
        if p.returncode:
            raise RuntimeError((p.stderr or p.stdout).decode(errors="replace")[:200])
        return p.stdout if binary else p.stdout.decode(errors="replace").strip()

    def dump(self):
        self.adb("shell", "uiautomator", "dump", "/data/local/tmp/farol-orb-ui.xml")
        return ET.fromstring(
            self.adb("shell", "cat", "/data/local/tmp/farol-orb-ui.xml")
        )

    def node(self, rid):
        for n in self.dump().iter("node"):
            if n.get("resource-id") == rid:
                b = list(map(int, re.findall(r"\d+", n.get("bounds", ""))))
                if len(b) == 4 and b[2] > b[0]:
                    return b
        return None

    def shot(self, name):
        (self.out / (name + ".png")).write_bytes(
            self.adb("exec-out", "screencap", "-p", binary=True)
        )

    def wait(self, rid, timeout=8):
        fim = time.monotonic() + timeout
        while time.monotonic() < fim:
            b = self.node(rid)
            if b:
                return b
            time.sleep(0.4)
        raise AssertionError("Elemento ausente: " + rid)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--serial", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    fone = Phone(args.serial, args.out)
    resultados = []

    def check(nome, acao):
        try:
            detalhe = acao()
            resultados.append({"name": nome, "status": "pass", "detail": str(detalhe)})
            print("PASS", nome, detalhe, flush=True)
        except Exception as e:
            fone.shot("FALHA-" + str(len(resultados)))
            resultados.append({"name": nome, "status": "fail", "detail": str(e)})
            raise
        finally:
            (fone.out / "orb-tests.json").write_text(
                json.dumps(resultados, ensure_ascii=False, indent=2)
            )

    def invocar():
        fone.adb("shell", "am", "force-stop", PACKAGE)
        fone.adb(
            "shell",
            "monkey",
            "-p",
            PACKAGE,
            "-c",
            "android.intent.category.LAUNCHER",
            "1",
        )
        time.sleep(0.8)
        fone.adb("shell", "input", "keyevent", "219")
        b = fone.wait(ORB)
        fone.shot("01-orb-inicial")
        return "orb presente em " + str(b)

    check("assistente desperta com o orb", invocar)

    def arrastar():
        antes = fone.node(ORB)
        x, y = (antes[0] + antes[2]) // 2, (antes[1] + antes[3]) // 2
        size = fone.adb("shell", "wm", "size")
        w, h = map(int, re.findall(r"\d+", size)[-2:])
        fone.adb(
            "shell", "input", "swipe", str(x), str(y), str(w - 70), str(h - 90), "450"
        )
        time.sleep(0.6)
        depois = fone.node(ORB)
        fone.shot("02-orb-canto")
        assert depois and depois[0] > antes[0] and depois[1] > antes[1], (
            "orb não mudou para o canto"
        )
        return f"{antes[:2]} -> {depois[:2]}"

    check("orb é arrastável para outro canto", arrastar)

    def desligar():
        b = fone.node(ORB)
        x, y = (b[0] + b[2]) // 2, (b[1] + b[3]) // 2
        size = fone.adb("shell", "wm", "size")
        w, h = map(int, re.findall(r"\d+", size)[-2:])
        fone.adb(
            "shell", "input", "swipe", str(x), str(y), str(w // 2), str(h - 100), "450"
        )
        time.sleep(0.8)
        fone.shot("03-orb-desligado")
        painel = fone.node(PANEL)
        assert painel is None, "painel não fechou ao soltar na zona de desligar"
        return "painel fechado"

    check("soltar na zona desliga o assistente", desligar)


if __name__ == "__main__":
    main()
