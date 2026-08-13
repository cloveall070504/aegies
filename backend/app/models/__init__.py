"""模型包：导入所有模型以便 Base.metadata 注册。"""
from app.models.user import User
from app.models.document import Document
from app.models.risk_point import RiskPoint
from app.models.operation_record import OperationRecord
from app.models.quiz_record import QuizRecord
from app.models.personal_profile import PersonalProfile
from app.models.case_entry import CaseEntry
from app.models.org_profile import OrgProfile
from app.models.report import Report
from app.models.prompt_template import PromptTemplate

__all__ = [
    "User",
    "Document",
    "RiskPoint",
    "OperationRecord",
    "QuizRecord",
    "PersonalProfile",
    "CaseEntry",
    "OrgProfile",
    "Report",
    "PromptTemplate",
]
