"""模型包：导入所有模型以便 Base.metadata 注册。"""
from app.models.user import User
from app.models.document import Document
from app.models.risk_point import RiskPoint
from app.models.operation_record import OperationRecord
from app.models.quiz_record import QuizRecord
from app.models.quiz_question import QuizQuestion
from app.models.personal_profile import PersonalProfile
from app.models.case_entry import CaseEntry
from app.models.org_profile import OrgProfile
from app.models.conversation import Conversation, ConversationMessage
from app.models.report import Report
from app.models.prompt_template import PromptTemplate
from app.models.scene import Scene
from app.models.scene_step import SceneStep
from app.models.training import TrainingRecord
from app.models.assignment import Assignment, AssignmentProgress
from app.models.learning import ReviewItem, Notification
from app.models.coach import StudentCoachProfile, CoachBadge
from app.models.quiz_paper import QuizPaper

__all__ = [
    "User",
    "Document",
    "RiskPoint",
    "OperationRecord",
    "QuizRecord",
    "QuizQuestion",
    "PersonalProfile",
    "CaseEntry",
    "OrgProfile",
    "Report",
    "PromptTemplate",
    "Scene",
    "SceneStep",
    "TrainingRecord",
    "Assignment",
    "AssignmentProgress",
    "ReviewItem",
    "Notification",
    "Conversation",
    "ConversationMessage",
    "StudentCoachProfile",
    "CoachBadge",
    "QuizPaper",
]
