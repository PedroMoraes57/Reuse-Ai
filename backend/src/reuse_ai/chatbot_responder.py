from __future__ import annotations

from typing import Any

from reuse_ai.chatbot_knowledge import ChatbotKnowledgeBase, SystemProfile, TopicProfile
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
        if kind == "system":
            return self._system_response(
                self.knowledge_base.get_system_entry(entity_match.candidate.metadata["entry_id"]),
            )
        return self._item_response(
            class_id=entity_match.candidate.metadata["class_id"],
            mode_id=mode_match.candidate.metadata["mode_id"] if mode_match else "action",
            analysis_context=analysis_context,
            used_item_context=False,
        )

    def generate_multi_item_response(
        self,
        item_matches: list[IntentMatch],
        mode_match: IntentMatch | None,
        analysis_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not item_matches:
            return self.fallback(
                suggestions=[],
                domain_detected=True,
                system_detected=False,
            )

        mode_id = mode_match.candidate.metadata["mode_id"] if mode_match else "action"
        item_payloads = []
        for match in item_matches[:4]:
            class_id = match.candidate.metadata["class_id"]
            profile, advisory = self.knowledge_base.build_item_payload(
                class_id,
                analysis_context=analysis_context,
            )
            item_payloads.append((profile, advisory))

        item_names = [profile.display_name_pt for profile, _ in item_payloads]
        detail_lines = [
            self._multi_item_line(index + 1, profile.display_name_pt, profile.hazardous, advisory, mode_id)
            for index, (profile, advisory) in enumerate(item_payloads)
        ]
        answer = "\n\n".join(
            [
                self._multi_item_intro(mode_id, item_names),
                "\n".join(detail_lines),
            ]
        )
        response_type = "alert" if any(profile.hazardous for profile, _ in item_payloads) else (
            "explanation" if mode_id == "explanation" else "decision"
        )

        return {
            "response_type": response_type,
            "answer": answer,
            "action": self._multi_item_follow_up_action(item_names),
            "alert": (
                "Como sua pergunta mistura mais de um item, trate cada material separadamente antes de descartar."
                if len(item_payloads) > 1
                else None
            ),
            "analysis_warning": self._analysis_warning(analysis_context),
            "quick_replies": self._multi_item_quick_replies(item_names),
            "used_item_context": False,
            "referenced_item": None,
        }

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

    def response_for_page_context(self, route_id: str | None) -> dict[str, Any] | None:
        if not route_id:
            return None
        entry = self.knowledge_base.get_system_entry_for_route(route_id)
        if not entry:
            return None
        return self._system_response(entry, from_page_context=True)

    def conversation_response(
        self,
        conversation_id: str,
        route_id: str | None = None,
    ) -> dict[str, Any]:
        answer = "Posso te ajudar com descarte, sustentabilidade, acessibilidade e com a propria Reuse.AI."
        action = "Me diga um item, uma duvida ou a funcionalidade que voce quer entender melhor."
        quick_replies = self._system_quick_replies(route_id)

        if conversation_id == "greeting":
            answer = "Oi! Tudo bem por aqui. Como posso te ajudar?"
            action = "Se quiser, me diga o item, a duvida ou a tela da plataforma que voce quer entender."
        elif conversation_id == "thanks":
            answer = "Por nada! Fico feliz em ajudar."
            action = "Se quiser continuar, pode mandar outra pergunta do jeito que for mais natural para voce."
        elif conversation_id == "goodbye":
            answer = "Ate mais!"
            action = "Quando quiser voltar, posso te ajudar com descarte, acessibilidade, sustentabilidade e duvidas sobre a plataforma."
        elif conversation_id == "identity":
            answer = "Sou o assistente da Reuse.AI."
            action = "Posso interpretar perguntas mais abertas, explicar o descarte de itens e tirar duvidas sobre as paginas e funcoes do sistema."

        return {
            "response_type": "explanation",
            "answer": answer,
            "action": action,
            "quick_replies": quick_replies,
            "used_item_context": False,
            "referenced_item": None,
        }

    def ambiguous_item_clarification(
        self,
        item_mentions: list[str],
    ) -> dict[str, Any]:
        cleaned_mentions = [item.strip() for item in item_mentions if item.strip()]
        mentions_text = ", ".join(f'"{item}"' for item in cleaned_mentions[:4])
        answer = "Entendi os itens que voce citou, mas o material de cada embalagem ainda nao ficou claro."
        action = (
            "Me diga o material ou o tipo de cada item, por exemplo: papel/cartao, plastico, metalizado, "
            "isopor ou longa vida."
        )
        if mentions_text:
            action = (
                f"Foram estes itens que entendi: {mentions_text}. "
                "Me diga o material ou o tipo de cada um, por exemplo: papel/cartao, plastico, metalizado, "
                "isopor ou longa vida."
            )

        return {
            "response_type": "clarification",
            "answer": answer,
            "action": action,
            "quick_replies": [
                "E de papel/cartao",
                "E de plastico",
                "Tem parte metalizada",
                "Vou descrever melhor o item",
            ],
            "used_item_context": False,
            "referenced_item": None,
        }

    def fallback(
        self,
        suggestions: list[str],
        domain_detected: bool,
        system_detected: bool,
        route_id: str | None = None,
    ) -> dict[str, Any]:
        if suggestions:
            suggestion_text = ", ".join(suggestions[:3])
            return {
                "response_type": "clarification",
                "answer": "Entendi parte da sua pergunta, mas ainda nao ficou claro qual item ou tema voce quer priorizar.",
                "action": f"Talvez voce esteja falando de: {suggestion_text}. Se quiser, me diga isso em uma frase mais direta ou separando os itens.",
                "quick_replies": self._default_quick_replies(),
                "used_item_context": False,
                "referenced_item": None,
            }

        if system_detected:
            page_response = self.response_for_page_context(route_id)
            if page_response:
                return page_response

            return {
                "response_type": "clarification",
                "answer": "Entendi que sua pergunta e sobre a plataforma, mas ainda faltou dizer a pagina ou funcionalidade principal.",
                "action": "Voce pode perguntar sobre classificacao, ranking, amigos, batalhas, perfil, login, cadastro ou localizacao.",
                "quick_replies": self._system_quick_replies(route_id),
                "used_item_context": False,
                "referenced_item": None,
            }

        if domain_detected:
            return {
                "response_type": "clarification",
                "answer": "Entendi que sua pergunta e sobre descarte, sustentabilidade ou acessibilidade, mas ainda faltou o foco principal.",
                "action": "Me diga o item ou o tema central, como 'pilha', 'oleo de cozinha', 'compostagem', 'coleta seletiva' ou 'acessibilidade digital'.",
                "quick_replies": self._default_quick_replies(),
                "used_item_context": False,
                "referenced_item": None,
            }

        return {
            "response_type": "clarification",
            "answer": "Posso conversar sobre descarte, sustentabilidade, acessibilidade digital e sobre a propria Reuse.AI.",
            "action": "Se quiser, tente algo como 'oi', 'onde descartar pilha?', 'o que e acessibilidade digital?' ou 'como funciona o ranking?'.",
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

    def _system_response(
        self,
        profile: SystemProfile,
        from_page_context: bool = False,
    ) -> dict[str, Any]:
        answer = profile.answer
        if from_page_context and profile.kind == "page":
            answer = f"Na tela atual, {profile.answer[0].lower()}{profile.answer[1:]}"

        return {
            "response_type": profile.response_type,
            "answer": answer,
            "action": profile.action,
            "alert": profile.alert,
            "quick_replies": list(profile.quick_replies) or self._system_quick_replies(
                profile.route_ids[0] if profile.route_ids else None
            ),
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
            "Como analisar uma imagem?",
            "Onde descartar pilhas?",
            "O que e acessibilidade digital?",
            "Como funciona o ranking?",
            "Precisa lavar embalagem para reciclar?",
        ]

    def _system_quick_replies(self, route_id: str | None) -> list[str]:
        if route_id:
            entry = self.knowledge_base.get_system_entry_for_route(route_id)
            if entry and entry.quick_replies:
                return list(entry.quick_replies)

        return [
            "Como funciona a Reuse.AI?",
            "Como analisar uma imagem?",
            "Como funciona o ranking?",
            "Como adicionar amigos?",
        ]

    def _multi_item_intro(self, mode_id: str, item_names: list[str]) -> str:
        names = ", ".join(item_names)
        if mode_id == "where":
            return f"Voce citou mais de um item: {names}. O destino muda para cada um."
        if mode_id == "preparation":
            return f"Voce citou mais de um item: {names}. Para preparar tudo corretamente, vale separar por item."
        if mode_id == "explanation":
            return f"Voce citou mais de um item: {names}. Eles seguem fluxos diferentes por causa do material e do risco envolvido."
        return f"Voce citou mais de um item: {names}. O descarte correto precisa ser separado por item."

    def _multi_item_line(
        self,
        index: int,
        item_name: str,
        hazardous: bool,
        advisory: dict[str, Any],
        mode_id: str,
    ) -> str:
        if mode_id == "where":
            return (
                f"{index}. {item_name}: leve para {advisory['dropoff'].rstrip('.')}. "
                f"Antes disso, {advisory['preparation'].rstrip('.')}."
            )
        if mode_id == "preparation":
            return (
                f"{index}. {item_name}: {advisory['preparation'].rstrip('.')}. "
                f"Depois, encaminhe para {advisory['dropoff'].rstrip('.')}."
            )
        if mode_id == "explanation":
            return (
                f"{index}. {item_name}: {advisory['recommendation'].rstrip('.')}. "
                f"O destino indicado e {advisory['dropoff'].rstrip('.')}."
            )
        if hazardous:
            return (
                f"{index}. {item_name}: nao coloque no lixo comum. "
                f"Leve para {advisory['dropoff'].rstrip('.')}. Antes disso, {advisory['preparation'].rstrip('.')}."
            )
        return (
            f"{index}. {item_name}: {advisory['recommendation'].rstrip('.')}. "
            f"Depois, {advisory['preparation'].rstrip('.')} e leve para {advisory['dropoff'].rstrip('.')}."
        )

    def _multi_item_follow_up_action(self, item_names: list[str]) -> str:
        if not item_names:
            return "Se quiser, eu posso detalhar o descarte de um item por vez."
        if len(item_names) == 1:
            return f"Se quiser, eu tambem posso detalhar so {item_names[0]}."
        return (
            f"Se quiser, eu posso detalhar separadamente {item_names[0]} "
            f"ou {item_names[1]}."
        )

    def _multi_item_quick_replies(self, item_names: list[str]) -> list[str]:
        replies: list[str] = []
        for item_name in item_names[:2]:
            replies.append(f"Onde descartar {item_name}?")
        replies.append("Como separar itens diferentes no descarte?")
        replies.append("Precisa lavar embalagem para reciclar?")
        return replies
