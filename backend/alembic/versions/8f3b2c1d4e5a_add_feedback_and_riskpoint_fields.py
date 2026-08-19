"""add feedback-loop & risk-point fields

落实清单项 A1（教师可编辑/审核风险点）与 A2（学生错误回流闭环）与 A3（评分透明化）：
- risk_points: owner_id / source / reviewed / updated_at
- operation_records: score_breakdown / student_feedback / is_misjudge / feedback_status / feedback_at

Revision ID: 8f3b2c1d4e5a
Revises: 7c8d9e0f1a2b
Create Date: 2026-08-18 14:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8f3b2c1d4e5a'
down_revision: Union[str, Sequence[str], None] = '7c8d9e0f1a2b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # risk_points：反馈闭环字段（A1）
    op.add_column('risk_points', sa.Column('owner_id', sa.Integer(), nullable=True))
    op.create_index('ix_risk_points_owner_id', 'risk_points', ['owner_id'], unique=False)
    op.add_column('risk_points', sa.Column('source', sa.String(16), nullable=False, server_default='seed'))
    op.add_column('risk_points', sa.Column('reviewed', sa.Integer(), nullable=False, server_default='1'))
    op.add_column('risk_points', sa.Column('updated_at', sa.DateTime(), nullable=True))

    # operation_records：评分透明化 + 学生反馈闭环（A3 / A2）
    op.add_column('operation_records', sa.Column('score_breakdown', sa.Text(), nullable=False, server_default='[]'))
    op.add_column('operation_records', sa.Column('student_feedback', sa.Text(), nullable=False, server_default="''"))
    op.add_column('operation_records', sa.Column('is_misjudge', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('operation_records', sa.Column('feedback_status', sa.String(16), nullable=False, server_default="''"))
    op.add_column('operation_records', sa.Column('feedback_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('operation_records', 'feedback_at')
    op.drop_column('operation_records', 'feedback_status')
    op.drop_column('operation_records', 'is_misjudge')
    op.drop_column('operation_records', 'student_feedback')
    op.drop_column('operation_records', 'score_breakdown')
    op.drop_column('risk_points', 'updated_at')
    op.drop_column('risk_points', 'reviewed')
    op.drop_column('risk_points', 'source')
    op.drop_index('ix_risk_points_owner_id', table_name='risk_points')
    op.drop_column('risk_points', 'owner_id')
