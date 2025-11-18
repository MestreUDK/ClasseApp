from flask_login import UserMixin

class User(UserMixin):
    def __init__(self, id, email):
        self.id = id
        self.email = email
    
    # Métodos obrigatórios do Flask-Login (UserMixin já fornece, mas é bom saber)
    # is_authenticated, is_active, is_anonymous, get_id