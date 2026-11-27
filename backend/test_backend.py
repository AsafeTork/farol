import copy, json, os, threading, unittest, urllib.error, urllib.request
from unittest.mock import patch
from farol_backend import (
    Budget,
    Gateway,
    GatewayError,
    clean,
    validate_request,
    validate_advice,
    call_openai,
    call_colab,
)


def envelope():
    return {
        "version": 1,
        "application": "com.ifpa.farol.fixture",
        "question": "Como continuo?",
        "nodes": [
            {"id": 1, "role": "textbox", "label": "CPF", "filled": False},
            {"id": 2, "role": "button", "label": "Continuar", "filled": False},
        ],
        "consent": "cloud-v1",
    }


class SchemaTests(unittest.TestCase):
    def test_valid(self):
        self.assertEqual(validate_request(envelope())["nodes"][0]["id"], 1)

    def test_requires_consent(self):
        d = envelope()
        d["consent"] = "none"
        with self.assertRaises(GatewayError):
            validate_request(d)

    def test_rejects_field_values(self):
        d = envelope()
        d["nodes"][0]["value"] = "super-secret"
        with self.assertRaises(GatewayError):
            validate_request(d)

    def test_rejects_hidden_extra_fields(self):
        d = envelope()
        d["screenshot"] = "data:image/png"
        with self.assertRaises(GatewayError):
            validate_request(d)

    def test_rejects_duplicate_ids(self):
        d = envelope()
        d["nodes"][1]["id"] = 1
        with self.assertRaises(GatewayError):
            validate_request(d)

    def test_rejects_boolean_id(self):
        d = envelope()
        d["nodes"][0]["id"] = True
        with self.assertRaises(GatewayError):
            validate_request(d)

    def test_rejects_empty_screen_and_question(self):
        d = envelope()
        d["nodes"] = []
        d["question"] = ""
        with self.assertRaises(GatewayError):
            validate_request(d)

    def test_can_answer_question_without_screen(self):
        d = envelope()
        d["nodes"] = []
        self.assertEqual(validate_request(d)["nodes"], [])

    def test_sanitizes_identifiers(self):
        d = envelope()
        d["nodes"][0]["label"] = "CPF 123.456.789-01"
        d["question"] = "Email ana@example.com, +55 91 99999-1234"
        s = json.dumps(validate_request(d))
        self.assertNotIn("123.456.789-01", s)
        self.assertNotIn("ana@example.com", s)
        self.assertNotIn("99999-1234", s)

    def test_bounded_nodes(self):
        d = envelope()
        d["nodes"] = d["nodes"] * 31
        with self.assertRaises(GatewayError):
            validate_request(d)

    def test_rejects_invented_target(self):
        with self.assertRaises(GatewayError):
            validate_advice(
                {
                    "instruction": "Toque no campo.",
                    "detail": "Um passo de cada vez.",
                    "target_id": 99,
                },
                envelope()["nodes"],
            )

    def test_refuses_empty_provider_output(self):
        with self.assertRaises(GatewayError):
            validate_advice(None, envelope()["nodes"])

    def test_null_target_allowed(self):
        self.assertIsNone(
            validate_advice(
                {
                    "instruction": "Preciso de mais contexto.",
                    "detail": "Diga qual ajuda quer.",
                    "target_id": None,
                },
                [],
            )["target_id"]
        )

    def test_history_sanitized(self):
        d = envelope()
        d["history"] = [
            {"role": "user", "text": "CPF 123.456.789-01"},
            {"role": "farol", "text": "Toque em Continuar."},
        ]
        s = json.dumps(validate_request(d))
        self.assertIn("history", s)
        self.assertNotIn("123.456.789-01", s)

    def test_history_bounded(self):
        d = envelope()
        d["history"] = [{"role": "user", "text": "x"}] * 9
        with self.assertRaises(GatewayError):
            validate_request(d)

    def test_skill_report_null_and_bounded(self):
        base = {
            "instruction": "Toque no campo.",
            "detail": "Um passo.",
            "target_id": None,
            "skill_report": None,
        }
        self.assertNotIn("skill_report", validate_advice(base, []))
        base["skill_report"] = "x" * 1201
        with self.assertRaises(GatewayError):
            validate_advice(base, [])

    def test_missing_key_does_not_fake_ai(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": ""}):
            with self.assertRaises(GatewayError) as e:
                call_openai(envelope())
            self.assertEqual(e.exception.code, "openai_not_configured")

    def test_daily_limit(self):
        b = Budget(daily=1)
        b.take()
        with self.assertRaises(GatewayError):
            b.take()


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.calls = []
        cls.token = "test-token-" + "x" * 24

        def provider(d):
            cls.calls.append(d)
            return {
                "instruction": "Toque no campo CPF.",
                "detail": "Você preenche no seu ritmo.",
                "target_id": 1,
                "provider": "test",
                "model": "fake",
                "usage": {},
            }

        cls.server = Gateway(("127.0.0.1", 0), cls.token, provider)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = "http://127.0.0.1:" + str(cls.server.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, data, token=None, path="/v1/assist"):
        req = urllib.request.Request(
            self.url + path,
            data=json.dumps(data).encode(),
            headers={
                "Authorization": "Bearer " + (token or self.token),
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=3) as r:
                return r.status, json.load(r)
        except urllib.error.HTTPError as e:
            with e:
                return e.code, json.load(e)

    def test_unauthorized_never_calls_provider(self):
        count = len(self.calls)
        status, _ = self.request(envelope(), "wrong")
        self.assertEqual(status, 401)
        self.assertEqual(len(self.calls), count)

    def test_unsafe_payload_never_calls_provider(self):
        d = envelope()
        d["nodes"][0]["value"] = "12345678901"
        count = len(self.calls)
        self.assertEqual(self.request(d)[0], 400)
        self.assertEqual(len(self.calls), count)

    def test_schema_to_provider_is_sanitized(self):
        d = envelope()
        d["question"] = "ana@example.com"
        status, result = self.request(d)
        self.assertEqual(status, 200)
        self.assertEqual(result["provider"], "test")
        self.assertNotIn("ana@example.com", json.dumps(self.calls[-1]))

    def test_metrics_do_not_contain_context(self):
        self.request(envelope())
        data = json.dumps(self.server.metrics)
        self.assertNotIn("CPF", data)
        self.assertNotIn("Como continuo?", data)
        self.assertNotIn(self.token, data)

    def test_unknown_route(self):
        self.assertEqual(self.request(envelope(), path="/other")[0], 404)


class ColabBridgeTests(unittest.TestCase):
    def test_colab_provider_parses_chat_completion(self):
        resposta = json.dumps(
            {
                "model": "cyber:latest",
                "eval_count": 42,
                "message": {
                    "content": json.dumps(
                        {
                            "instruction": "Toque no campo CPF.",
                            "detail": "Primeiro passo.",
                            "target_id": 1,
                            "skill_report": None,
                        }
                    )
                },
            }
        ).encode()

        class Falso:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def read(self, n):
                return resposta

        with (
            patch.dict(
                os.environ,
                {
                    "FAROL_COLAB_URL": "https://exemplo.trycloudflare.com",
                    "FAROL_COLAB_TOKEN": "x" * 40,
                },
            ),
            patch(
                "farol_backend.urllib.request.urlopen", return_value=Falso()
            ) as chamada,
        ):
            resultado = call_colab(validate_request(envelope()))
        self.assertEqual(resultado["provider"], "colab")
        self.assertEqual(resultado["target_id"], 1)
        pedido = json.loads(chamada.call_args[0][0].data)
        self.assertEqual(pedido["messages"][0]["role"], "system")
        self.assertIn("Farol", pedido["messages"][0]["content"])

    def test_colab_rejects_insecure_url(self):
        with patch.dict(
            os.environ,
            {"FAROL_COLAB_URL": "http://inseguro", "FAROL_COLAB_TOKEN": "x" * 40},
        ):
            with self.assertRaises(GatewayError):
                call_colab(validate_request(envelope()))


if __name__ == "__main__":
    unittest.main(verbosity=2)
