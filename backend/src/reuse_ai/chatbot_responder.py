from __future__ import annotations

from typing import Any

from reuse_ai.chatbot_knowledge import ChatbotKnowledgeBase, TopicProfile
from reuse_ai.nlp import IntentMatch


class ChatResponseGenerator:
    _STREAM_EXPLANATIONS = {
        "hazardous_battery": "porque pilhas e baterias podem vazar metais e contaminar outros residuos.",
        "hazardous_lamp": "porque lampadas exigem coleta especial e podem causar contaminacao ou acidente se quebrarem.",
        "e_waste": "porque eletronicos misturam plastico, metal e componentes que precisam de logistica reversa.",
        "bulky_e_waste": "porque eletrodomesticos grandes nao devem entrar na coleta comum e ainda podem ser reaproveitados.",
        "automotive_waste": "porque pecas automotivas podem conter oleo, graxa ou outros contaminantes.",
        "landfill_non_recyclable": "porque esse material costuma ser pequeno, contaminado ou de baixa reciclabilidade na triagem comum.",
        "food_soiled_paper": "porque gordura e restos de comida contaminam o papel e atrapalham a reciclagem.",
        "sanitary_waste": "porque itens higienicos tem risco de contaminacao e nao entram na coleta seletiva.",
        "plastic_film": "porque plastico flexivel geralmente exige ponto especifico e nao costuma entrar bem na triagem comum.",
        "recyclable_plastic_special": "porque nem toda coleta comum aceita isopor, mesmo quando ele esta limpo.",
        "recyclable_multilayer": "porque embalagens cartonadas misturam materiais e precisam estar limpas para serem aproveitadas.",
        "fresh_produce_reuse": "porque esse item ainda deve priorizar consumo, doacao ou reaproveitamento antes do descarte.",
        "organic_compost": "porque residuos organicos vegetais aproveitam melhor a compostagem do que a lixeira comum.",
        "organic_common": "porque restos de comida geram odor e vetores, e o fluxo certo e organicos ou coleta comum local.",
        "recyclable_paper": "porque papel so recicla bem quando esta seco e sem contaminacao.",
        "recyclable_glass": "porque vidro e reciclavel, mas precisa estar limpo e manuseado com seguranca.",
        "recyclable_metal": "porque metais costumam ser bem aproveitados na coleta seletiva quando estao limpos.",
    }

    def __init__(self, knowledge_base: ChatbotKnowledgeBase) -> None:
        self.knowledge_base = knowledge_base

    def generate_from_match(
        self,
        entity_match: IntentMatch,
        mode_match: IntentMatch | None,
        analysis_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        kind = entity_match.candidate.metadata["kind"]
        if kind == "topic":
            return self._topic_response(
                self.knowledge_base.get_topic(entity_match.candidate.metadata["topic_id"]),
                analysis_context=analysis_context,
            )
        return self._item_response(
            class_id=entity_match.candidate.metadata["class_id"],
            mode_id=mode_match.candidate.metadata["mode_id"] if mode_match else "action",
            analysis_context=analysis_context,
            used_item_context=False,
        )

    def generate_from_context(
        self,
        class_id: str,
        mode_id: str,
        analysis_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return self._item_response(
            class_id=class_id,
            mode_id=mode_id,
            analysis_context=analysis_context,
            used_item_context=True,
        )

    def system_explanation(
        self,
        class_id: str | None,
        analysis_context: dict[str, Any],
    ) -> dict[str, Any]:
        best_match = analysis_context.get("best_match", {})
        top_predictions = analysis_context.get("top_predictions") or []
        display_name = best_match.get("display_name_pt") or "esse item"

        if analysis_context.get("uncertain_prediction") and top_predictions:
            alternatives = ", ".join(
                prediction.get("display_name_pt", "outra classe")
                for prediction in top_predictions[1:3]
                if prediction.get("display_name_pt")
            )
            action = "Tire outra foto com fundo limpo e boa luz para confirmar o descarte."
            if alternatives:
                action = f"{action} As alternativas mais proximas foram {alternatives}."
            return {
                "response_type": "explanation",
                "answer": f"O sistema apontou {display_name}, mas a confianca ficou baixa.",
                "action": action,
                "quick_replies": self._item_quick_replies(display_name),
                "used_item_context": True,
                "referenced_item": {"class_id": class_id, "display_name_pt": display_name} if class_id else None,
            }

        return {
            "response_type": "explanation",
            "answer": f"O sistema escolheu {display_name} porque essa foi a correspondencia mais forte com a imagem enviada.",
            "action": f"Siga a orientacao de descarte para {display_name} e, se o item parecer diferente, envie outra foto.",
            "quick_replies": self._item_quick_replies(display_name),
            "used_item_context": True,
            "referenced_item": {"class_id": class_id, "display_name_pt": display_name} if class_id else None,
        }

    def fallback(self, suggestions: list[str], domain_detected: bool) -> dict[str, Any]:
        if suggestions:
            suggestion_text = ", ".join(suggestions[:3])
            return {
                "response_type": "clarification",
                "answer": "Ainda nao encontrei uma correspondencia forte o bastante para responder com seguranca.",
                "action": f"Talvez voce esteja falando de: {suggestion_text}. Se puder, reformule em uma frase curta com o item ou tema central.",
                "quick_replies": self._default_quick_replies(),
                "used_item_context": False,
                "referenced_item": None,
            }

        if domain_detected:
            return {
                "response_type": "clarification",
                "answer": "Entendi que sua pergunta e sobre descarte ou sustentabilidade, mas ainda faltou o foco principal.",
                "action": "Me diga o item ou o tema central, como 'pilha', 'oleo de cozinha', 'compostagem' ou 'coleta seletiva'.",
                "quick_replies": self._default_quick_replies(),
                "used_item_context": False,
                "referenced_item": None,
            }

        return {
            "response_type": "clarification",
            "answer": "Posso ajudar com descarte correto, reciclaveis, compostagem e duvidas gerais de sustentabilidade.",
            "action": "Escreva sua duvida em uma frase curta, como 'onde descartar pilha?' ou 'precisa lavar embalagem para reciclar?'.",
            "quick_replies": self._default_quick_replies(),
            "used_item_context": False,
            "referenced_item": None,
        }

    def _topic_response(
        self,
        topic: TopicProfile,
        analysis_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return {
            "response_type": topic.response_type,
            "answer": topic.answer,
            "action": topic.action,
            "alert": topic.alert,
            "analysis_warning": self._analysis_warning(analysis_context),
            "quick_replies": list(topic.quick_replies) or self._default_quick_replies(),
            "used_item_context": False,
            "referenced_item": None,
        }

    def _item_response(
        self,
        class_id: str,
        mode_id: str,
        analysis_context: dict[str, Any] | None,
        used_item_context: bool,
    ) -> dict[str, Any]:
        profile, advisory = self.knowledge_base.build_item_payload(class_id, analysis_context=analysis_context)
        if mode_id == "where":
            answer = f"Para {profile.display_name_pt}, o ponto mais seguro e {advisory['dropoff'].rstrip('.')}."
            action = f"Antes de levar, {advisory['preparation'].rstrip('.')}."
            response_type = "decision"
            alert = None
        elif mode_id == "preparation":
            answer = f"Antes de descartar {profile.display_name_pt}, {advisory['preparation'].rstrip('.')}."
            action = f"Depois disso, encaminhe para {advisory['dropoff'].rstrip('.')}."
            response_type = "decision"
            alert = None
        elif mode_id == "explanation":
            reason = self._STREAM_EXPLANATIONS.get(
                profile.disposal_stream,
                "porque o material precisa seguir o fluxo de descarte indicado pelo sistema.",
            )
            answer = f"{profile.display_name_pt} deve seguir esse fluxo {reason}"
            action = f"Na pratica: {advisory['recommendation'].rstrip('.')}. Depois, leve para {advisory['dropoff'].rstrip('.')}."
            response_type = "explanation"
            alert = None
        else:
            if profile.hazardous:
                answer = f"Nao coloque {profile.display_name_pt} no lixo comum."
                action = f"Leve para {advisory['dropoff'].rstrip('.')}. Antes disso, {advisory['preparation'].rstrip('.')}."
                response_type = "alert"
                alert = "Evite misturar esse item com reciclaveis secos ou lixo comum."
            else:
                answer = advisory["recommendation"].rstrip(".") + "."
                action = f"Proximo passo: {advisory['preparation'].rstrip('.')}. Depois, leve para {advisory['dropoff'].rstrip('.')}."
                response_type = "decision"
                alert = None

        return {
            "response_type": response_type,
            "answer": answer,
            "action": action,
            "alert": alert,
            "analysis_warning": self._analysis_warning(analysis_context),
            "quick_replies": self._item_quick_replies(profile.display_name_pt),
            "used_item_context": used_item_context,
            "referenced_item": {
                "class_id": class_id,
                "display_name_pt": profile.display_name_pt,
            },
        }

    def _analysis_warning(self, analysis_context: dict[str, Any] | None) -> str | None:
        if not analysis_context or not analysis_context.get("uncertain_prediction"):
            return None
        return "A analise da imagem teve confianca baixa. Se o item nao parecer esse, envie outra foto."

    def _item_quick_replies(self, item_name: str) -> list[str]:
        return [
            f"Onde descartar {item_name}?",
            "Pode ir no lixo comum?",
            "Como preparar antes de descartar?",
            "Por que esse item nao vai na reciclavel?",
        ]

    def _default_quick_replies(self) -> list[str]:
        return [
            "Onde descartar pilhas?",
            "Precisa lavar embalagem para reciclar?",
            "Oleo de cozinha pode ir na pia?",
            "Como reduzir lixo em casa?",
        ]
